# @fredko/nestjs-opentelemetry-tracing

A NestJS package for tracing services.

## Description

`@fredko/nestjs-opentelemetry-tracing` is a NestJS module that provides OpenTelemetry tracing capabilities for your application. It allows you to easily trace the execution of your controllers and providers, giving you insights into the performance and behavior of your application.

## Installation

```bash
npm install @fredko/nestjs-opentelemetry-tracing @nestjs/common @nestjs/core @nestjs/microservices @opentelemetry/api rxjs
```

## Usage

### Basic Usage

1. Import `OtelNestTracingModule` into your root module:

```typescript
import { Module } from '@nestjs/common';
import { OtelNestTracingModule } from '@fredko/nestjs-opentelemetry-tracing';

@Module({
  imports: [
    OtelNestTracingModule.forRoot({
      // Optional configuration options
    }),
  ],
})
export class AppModule {}
```

2. The module will automatically instrument your controllers and providers for tracing.

### Configuration Options

The `forRoot` method accepts the following configuration options:

- `dirInclusionPatterns`: An array of regular expressions to filter which directories to include for tracing.
- `dirExcludePatterns`: An array of regular expressions to filter which directories to exclude from tracing.
- `classNameIncludePatterns`: An array of regular expressions to filter which class names to include for tracing.
- `classNameExcludePatterns`: An array of regular expressions to filter which class names to exclude from tracing.
- `methodNameIncludePatterns`: An array of regular expressions to filter which method names to include for tracing.
- `methodNameExcludePatterns`: An array of regular expressions to filter which method names to exclude from tracing.

These options allow you to fine-tune which parts of your application are traced. For example, you can include only certain directories or exclude specific classes or methods from being traced.

Example:

```typescript
OtelNestTracingModule.forRoot({
  dirInclusionPatterns: [/src/],
  dirExcludePatterns: [/node_modules/],
  classNameIncludePatterns: [/Service$/],
  classNameExcludePatterns: [/TestService$/],
  methodNameIncludePatterns: [/.*Async$/],
  methodNameExcludePatterns: [/^_/],
}),
```

### How Tracing Works

The tracing manager uses the provided patterns to determine which classes and methods should be instrumented. It checks both the class name and the file path to decide if a class is traceable. Similarly, it checks method names to decide if a method should be traced. The logic is implemented in the `isTraceableClass` and `isTraceableMethod` methods.

- **isTraceableClass**: Determines if a class should be traced based on its name and file path. A class is traceable if:
  - It matches at least one pattern in `classNameIncludePatterns` (or if this list is empty, all classes are included by default).
  - It does not match any pattern in `classNameExcludePatterns`.
  - Its file path matches at least one pattern in `dirInclusionPatterns` (or if this list is empty, all directories are included by default).
  - Its file path does not match any pattern in `dirExcludePatterns`.

- **isTraceableMethod**: Determines if a method should be traced based on its name. A method is traceable if:
  - It matches at least one pattern in `methodNameIncludePatterns` (or if this list is empty, all methods are included by default).
  - It does not match any pattern in `methodNameExcludePatterns`.

### Example

Consider the following configuration:

```typescript
OtelNestTracingModule.forRoot({
  classNameIncludePatterns: [/Service$/],
  classNameExcludePatterns: [/TestService$/],
  dirInclusionPatterns: [/src/],
  dirExcludePatterns: [/Repository/],
  methodNameIncludePatterns: [/.*Async$/],
  methodNameExcludePatterns: [/^_/],
});
```

- A class named `UserService` located in `src/services` will be traced because it ends with `Service` and is in the `src` directory.
- A class named `TestService` will not be traced because it matches the `classNameExcludePatterns`.
- A method named `fetchDataAsync` will be traced because it ends with `Async`.
- A method named `_privateMethod` will not be traced because it starts with `_`.

### Compiler Plugin

To use `dirInclusionPatterns` and `dirExcludePatterns`, you must configure the compiler plugin. This package includes a compiler plugin that can be used to automatically add tracing to your controllers and providers during compilation. To use the plugin, add it to your `nest-cli.json` file:

```json
{
  "compilerOptions": {
    "plugins": ["@fredko/nestjs-opentelemetry-tracing/plugin"]
  }
}
```

## License

MIT