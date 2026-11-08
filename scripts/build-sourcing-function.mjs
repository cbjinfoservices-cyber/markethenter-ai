import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import ts from 'typescript';

const output = process.argv[2];
if (!output) throw new Error('Usage: npm run build:sourcing-function -- <output.ts>');
const sources = [
  '../supabase/functions/_shared/amazon.ts',
  '../supabase/functions/sourcing-bestsellers/providerKey.ts',
  '../supabase/functions/sourcing-bestsellers/verification.ts',
  '../supabase/functions/sourcing-bestsellers/catalogCache.ts',
  '../supabase/functions/sourcing-bestsellers/redisCache.ts',
  '../supabase/functions/sourcing-bestsellers/handler.ts',
  '../supabase/functions/sourcing-bestsellers/index.ts',
];
const allowedImports = new Set(['../_shared/amazon.ts', './handler.ts', './verification.ts', './catalogCache.ts', './redisCache.ts', './providerKey.ts']);
const code = sources.map((source) => {
  const filename = fileURLToPath(new URL(source, import.meta.url));
  const result = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    transformers: {
      before: [() => (node) => ts.factory.updateSourceFile(node, node.statements.filter((statement) => {
        if (!ts.isImportDeclaration(statement)) return true;
        if (!ts.isStringLiteral(statement.moduleSpecifier) || !allowedImports.has(statement.moduleSpecifier.text)) {
          throw new Error(`Unsupported standalone import in ${source}`);
        }
        return false;
      }))],
    },
  });
  if (result.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(result.diagnostics, {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: (name) => name,
      getNewLine: () => '\n',
    }));
  }
  return result.outputText;
}).join('\n');
const destination = resolve(output);
if (sources.some((source) => resolve(fileURLToPath(new URL(source, import.meta.url))) === destination)) {
  throw new Error('Output must not overwrite connector source files');
}
writeFileSync(destination, code);
console.log(`Standalone sourcing function generated: ${destination}`);
