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
- `classNameIncludePatterns`: An array of regular expressions to filter which class names to include for tracing.
- `classNameExcludePatterns`: An array of regular expressions to filter which class names to exclude from tracing.
- `methodNameIncludePatterns`: An array of regular expressions to filter which method names to include for tracing.
- `methodNameExcludePatterns`: An array of regular expressions to filter which method names to exclude from tracing.

Example:

```typescript
OtelNestTracingModule.forRoot({
  dirInclusionPatterns: [/src/],
  classNameIncludePatterns: [/Service$/],
  classNameExcludePatterns: [/TestService$/],
  methodNameIncludePatterns: [/.*Async$/],
  methodNameExcludePatterns: [/^_/],
}),
```

### Compiler Plugin

This package also includes a compiler plugin that can be used to automatically add tracing to your controllers and providers during compilation. To use the plugin, add it to your `nest-cli.json` file:

```json
{
  "compilerOptions": {
    "plugins": ["@fredko/nestjs-opentelemetry-tracing/plugin"]
  }
}
```

## License

MIT
