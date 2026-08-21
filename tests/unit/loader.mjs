// Loader to mock HTTPS imports for testing
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('https://')) {
    // Return a data URL that exports empty object
    return {
      url: `data:text/javascript,export function createClient() { return {}; } export const STATUTS_COMMANDE = [];`,
      format: 'module',
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
