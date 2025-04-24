declare module "@hexagon/base64" {
    // We don't know the exact type, but declare it exists
    // and has a default export (based on the import usage).
    // Using 'any' is a common fallback when types are missing.
    const base64: any; 
    export default base64;
} 