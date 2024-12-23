import "reflect-metadata";
import * as ts from "typescript";
import * as path from "path";

export const before = (): ts.TransformerFactory<ts.SourceFile> => {
    return (context) => {
        return (sourceFile) => {
            const visitor = (node: ts.Node): ts.Node | ts.Node[] => {
                if (ts.isClassDeclaration(node) && node.name) {
                    const filePath = path.relative(process.cwd(), sourceFile.fileName);
                    const decoratorFactory = ts.factory.createCallExpression(ts.factory.createIdentifier("Reflect.defineMetadata"), undefined, [
                        ts.factory.createStringLiteral("filePath"),
                        ts.factory.createStringLiteral(filePath),
                        ts.factory.createIdentifier(node.name.text),
                    ]);
                    const decoratorStatement = ts.factory.createExpressionStatement(decoratorFactory);
                    return [node, decoratorStatement];
                }
                return ts.visitEachChild(node, visitor, context);
            };
            const updatedStatements = sourceFile.statements.flatMap((stmt) =>
                ts.isClassDeclaration(stmt) ? visitor(stmt) as ts.Statement[] : stmt
            );
            return ts.factory.updateSourceFile(sourceFile, ts.factory.createNodeArray(updatedStatements as ts.Statement[]));
        };
    };
};