import { Module, DynamicModule } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner } from '@nestjs/core';
import { OtelNestTracingManager, OtelNestTracingManagerOptions } from './OtelNestTracingManager';

@Module({})
export class OtelNestTracingModule {
    static forRoot(options: OtelNestTracingManagerOptions): DynamicModule {
        return {
            module: OtelNestTracingModule,
            imports: [DiscoveryModule],
            providers: [
                DiscoveryService,
                MetadataScanner,
                {
                    provide: OtelNestTracingManager,
                    useFactory: (discoveryService: DiscoveryService, metadataScanner: MetadataScanner) =>
                        new OtelNestTracingManager(
                            options.dirInclusionPatterns || [],
                            options.classNameIncludePatterns || [],
                            options.classNameExcludePatterns || [],
                            options.methodNameIncludePatterns || [],
                            options.methodNameExcludePatterns || [],
                            discoveryService,
                            metadataScanner
                        ),
                    inject: [DiscoveryService, MetadataScanner],
                },
            ],
            exports: [],
        };
    }
}