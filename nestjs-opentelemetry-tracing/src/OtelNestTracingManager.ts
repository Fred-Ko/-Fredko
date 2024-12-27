import 'reflect-metadata';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';

export interface OtelNestTracingManagerOptions {
    dirInclusionPatterns?: RegExp[];
    dirExcludePatterns?: RegExp[];
    classNameIncludePatterns?: RegExp[];
    classNameExcludePatterns?: RegExp[];
    methodNameIncludePatterns?: RegExp[];
    methodNameExcludePatterns?: RegExp[];
}

@Injectable()
export class OtelNestTracingManager implements OnModuleInit {
    private readonly directoryFilters: RegExp[];
    private readonly excludeDirectoryFilters: RegExp[];
    private readonly includeClassFilters: RegExp[];
    private readonly excludeClassFilters: RegExp[];
    private readonly includeMethodFilters: RegExp[];
    private readonly excludeMethodFilters: RegExp[];
    private readonly discoveryService: DiscoveryService;
    private readonly metadataScanner: MetadataScanner;

    constructor(options: OtelNestTracingManagerOptions, discoveryService: DiscoveryService, metadataScanner: MetadataScanner) {
        this.directoryFilters = options.dirInclusionPatterns ?? [];
        this.excludeDirectoryFilters = options.dirExcludePatterns ?? [];
        this.includeClassFilters = options.classNameIncludePatterns ?? [];
        this.excludeClassFilters = options.classNameExcludePatterns ?? [];
        this.includeMethodFilters = options.methodNameIncludePatterns ?? [];
        this.excludeMethodFilters = options.methodNameExcludePatterns ?? [];
        this.discoveryService = discoveryService;
        this.metadataScanner = metadataScanner;

        const controllers = this.discoveryService.getControllers();
        this.instrumentMethods(controllers);
    }

    onModuleInit(): void {
        const providers = this.discoveryService.getProviders();
        this.instrumentMethods(providers);
    }

    private instrumentMethods(instances: any[]): void {
        const tracedMap: Record<string, string[]> = {};
        for (const instanceWrapper of instances) {
            if (!instanceWrapper.instance) continue;
            const className = instanceWrapper.instance.constructor?.name ?? '';
            const filePath = instanceWrapper.metatype ? Reflect.getMetadata('filePath', instanceWrapper.metatype) : undefined;

            if (!this.isTraceableClass(className, filePath)) continue;

            this.instrumentClassMethods(instanceWrapper.instance, className, tracedMap);
        }
        this.logTracedMap(tracedMap);
    }

    private instrumentClassMethods(instance: any, className: string, tracedMap: Record<string, string[]>): void {
        const prototype = Object.getPrototypeOf(instance);
        const methodNames = this.metadataScanner.getAllMethodNames(prototype);
        for (const methodName of methodNames) {
            if (!this.isTraceableMethod(methodName)) {
                continue;
            }
            this.instrumentOneMethod(prototype, className, methodName, tracedMap);
        }
    }

    private instrumentOneMethod(prototype: any, className: string, methodName: string, tracedMap: Record<string, string[]>): void {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
        if (!descriptor || typeof descriptor.value !== 'function') {
            return;
        }
        const originalMethod = descriptor.value;
        const wrappedMethod = this.createWrappedMethod(className, methodName, originalMethod);
        this.copyMethodMetadata(originalMethod, wrappedMethod);
        Object.defineProperty(prototype, methodName, { ...descriptor, value: wrappedMethod });
        this.recordTracedResult(tracedMap, className, methodName);
    }

    private createWrappedMethod(className: string, methodName: string, originalMethod: Function): Function {
        const tracer = trace.getTracer('OtelNestTracer');
        return function (this: any, ...args: any[]) {
            const span = tracer.startSpan(`${className}.${methodName}`);
            const spanContext = trace.setSpan(context.active(), span);

            const proceed = () => originalMethod.apply(this, args);

            const result = proceed();
            const isAsync = result && typeof result.then === 'function';

            if (isAsync) {
                return context.with(spanContext, async () => {
                    try {
                        const asyncResult = await result;
                        span.setStatus({ code: SpanStatusCode.OK });
                        return asyncResult;
                    } catch (error: any) {
                        span.recordException(error);
                        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
                        throw error instanceof Error ? error : new Error(String(error));
                    } finally {
                        span.end();
                    }
                });
            } else {
                try {
                    const syncResult = result;
                    span.setStatus({ code: SpanStatusCode.OK });
                    return syncResult;
                } catch (error: any) {
                    span.recordException(error);
                    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
                    throw error instanceof Error ? error : new Error(String(error));
                } finally {
                    span.end();
                }
            }
        };
    }

    private copyMethodMetadata(originalMethod: Function, wrappedMethod: Function): void {
        Reflect.getMetadataKeys(originalMethod).forEach(key => {
            const meta = Reflect.getMetadata(key, originalMethod);
            Reflect.defineMetadata(key, meta, wrappedMethod);
        });
    }

    private recordTracedResult(tracedMap: Record<string, string[]>, className: string, methodName: string): void {
        if (!tracedMap[className]) {
            tracedMap[className] = [];
        }
        tracedMap[className].push(methodName);
    }

    private logTracedMap(tracedMap: Record<string, string[]>): void {
        for (const className in tracedMap) {
            Logger.log(`Traced: ${className}.{ ${tracedMap[className].join(' | ')} }`, this.constructor.name);
        }
    }

    private isTraceableClass(className: string, filePath?: string): boolean {
        if (!className.trim()) {
            return false;
        }
        const isClassIncluded = this.includeClassFilters.length === 0 || this.includeClassFilters.some(regex => regex.test(className));
        const isClassExcluded = this.excludeClassFilters.some(regex => regex.test(className));

        if (!filePath) {
            return isClassIncluded && !isClassExcluded;
        }

        const isDirectoryIncluded = this.directoryFilters.length === 0 || this.directoryFilters.some(regex => regex.test(filePath));
        const isDirectoryExcluded = this.excludeDirectoryFilters.some(regex => regex.test(filePath));

        return isClassIncluded && !isClassExcluded && isDirectoryIncluded && !isDirectoryExcluded;
    }

    private isTraceableMethod(methodName: string): boolean {
        const isMethodIncluded = this.includeMethodFilters.length === 0 || this.includeMethodFilters.some(regex => regex.test(methodName));
        const isMethodExcluded = this.excludeMethodFilters.some(regex => regex.test(methodName));
        return isMethodIncluded && !isMethodExcluded;
    }
}
