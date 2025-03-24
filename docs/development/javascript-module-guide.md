# JavaScript Module Guide

## ES Modules vs CommonJS

This project uses **ES Modules** for all JavaScript files. This is specified in the `package.json` file with:

```json
{
  "type": "module"
}
```

## Key Rules

1. **NEVER use `require()` in any JavaScript files** - this will cause runtime errors
2. **ALWAYS use ES Module import syntax:**

```javascript
// ✅ CORRECT: ES Module syntax
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ❌ INCORRECT: CommonJS syntax
// const { execSync } = require('child_process');
// const fs = require('fs');
// const path = require('path');
```

3. **For ESM directory access, use:**

```javascript
// ✅ CORRECT: Get __dirname and __filename in ES Modules
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

4. **For all scripts, add the Node.js shebang:**

```javascript
#!/usr/bin/env node
```

## Common Errors

### "require is not defined in ES module scope"

This error occurs when using CommonJS `require()` in an ES Module.

Fix by converting:
```javascript
// ❌ INCORRECT:
const { execSync } = require('child_process');

// ✅ CORRECT:
import { execSync } from 'child_process';
```

### "__dirname is not defined in ES module scope"

This error occurs when trying to use CommonJS global variables in ES Modules.

Fix by adding:
```javascript
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

## Converting Files Between Formats

### CommonJS to ES Module

1. Replace `require()` calls with `import` statements
2. Replace `module.exports` with `export` statements
3. Add proper ES Module directory handling if needed

### If ES Modules Must Be Disabled for a File

Rename the file to use the `.cjs` extension for CommonJS files:
```
script.js -> script.cjs
```

## Testing ES Module Scripts

To test if your script is properly using ES Module syntax:

```bash
node script.js
```

If you see "require is not defined in ES module scope", you need to fix your imports.

## References

- [Node.js ES Modules Documentation](https://nodejs.org/api/esm.html)
- [MDN Import Statement](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import) 