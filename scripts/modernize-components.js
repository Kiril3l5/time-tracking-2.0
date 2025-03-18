#!/usr/bin/env node

/**
 * Script to help modernize React components
 * This script analyzes and provides guidance for modernizing class components to function components
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Logging utilities
const log = {
  info: (msg) => console.log(`${colors.blue}INFO:${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}SUCCESS:${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}WARNING:${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}ERROR:${colors.reset} ${msg}`),
  title: (msg) => console.log(`\n${colors.magenta}${msg}${colors.reset}\n` + '='.repeat(msg.length) + '\n'),
};

/**
 * Find all class components in the codebase
 */
function findClassComponents() {
  log.info('Finding class components in the codebase...');
  
  try {
    // Use grep to find class components
    const output = execSync(
      'grep -r --include="*.tsx" --include="*.jsx" "class.*extends.*Component" packages/',
      { cwd: rootDir, encoding: 'utf8' }
    );
    
    // Parse the results
    const files = {};
    output.split('\n').filter(Boolean).forEach(line => {
      const match = line.match(/^([^:]+):/);
      if (match) {
        const filePath = match[1];
        if (!files[filePath]) {
          files[filePath] = [];
        }
        files[filePath].push(line.substring(match[0].length).trim());
      }
    });
    
    return files;
  } catch (error) {
    if (error.status === 1 && error.stdout === '') {
      log.success('No class components found!');
      return {};
    }
    log.error(`Error finding class components: ${error.message}`);
    return {};
  }
}

/**
 * Find all lifecycle methods in the codebase
 */
function findLifecycleMethods() {
  log.info('Finding lifecycle methods in the codebase...');
  
  const lifecycleMethods = [
    'componentDidMount',
    'componentDidUpdate',
    'componentWillUnmount',
    'componentWillMount',
    'componentWillUpdate',
    'componentWillReceiveProps',
    'getDerivedStateFromProps',
    'getSnapshotBeforeUpdate',
    'shouldComponentUpdate'
  ];
  
  const results = {};
  
  for (const method of lifecycleMethods) {
    try {
      const output = execSync(
        `grep -r --include="*.tsx" --include="*.jsx" "${method}[^a-zA-Z0-9]" packages/`,
        { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      
      output.split('\n').filter(Boolean).forEach(line => {
        const match = line.match(/^([^:]+):/);
        if (match) {
          const filePath = match[1];
          if (!results[filePath]) {
            results[filePath] = {};
          }
          if (!results[filePath][method]) {
            results[filePath][method] = [];
          }
          results[filePath][method].push(line.substring(match[0].length).trim());
        }
      });
    } catch (error) {
      // Grep returns exit code 1 when no matches are found
      if (error.status !== 1) {
        log.error(`Error finding ${method}: ${error.message}`);
      }
    }
  }
  
  return results;
}

/**
 * Generate modernization report
 */
function generateReport(classComponents, lifecycleMethods) {
  log.title('REACT COMPONENT MODERNIZATION REPORT');
  
  let markdownReport = '# React Component Modernization Report\n\n';
  
  // Class components report
  log.info('Generating report for class components...');
  markdownReport += '## Class Components\n\n';
  
  const classComponentFiles = Object.keys(classComponents);
  if (classComponentFiles.length === 0) {
    log.success('No class components found!');
    markdownReport += 'No class components found. All components are using modern function component syntax.\n\n';
  } else {
    log.warning(`Found ${classComponentFiles.length} files with class components.`);
    markdownReport += `Found ${classComponentFiles.length} files with class components:\n\n`;
    
    classComponentFiles.forEach(file => {
      const relativePath = path.relative(rootDir, file);
      markdownReport += `### ${relativePath}\n\n`;
      markdownReport += '```jsx\n';
      classComponents[file].forEach(line => {
        markdownReport += `${line}\n`;
      });
      markdownReport += '```\n\n';
      
      markdownReport += 'Modernization strategy:\n';
      markdownReport += '1. Convert to function component\n';
      markdownReport += '2. Replace state with useState or useReducer hooks\n';
      markdownReport += '3. Replace lifecycle methods with useEffect\n\n';
    });
  }
  
  // Lifecycle methods report
  log.info('Generating report for lifecycle methods...');
  markdownReport += '## Lifecycle Methods\n\n';
  
  const lifecycleMethodFiles = Object.keys(lifecycleMethods);
  if (lifecycleMethodFiles.length === 0) {
    log.success('No lifecycle methods found!');
    markdownReport += 'No lifecycle methods found.\n\n';
  } else {
    log.warning(`Found ${lifecycleMethodFiles.length} files with lifecycle methods.`);
    markdownReport += `Found ${lifecycleMethodFiles.length} files with lifecycle methods:\n\n`;
    
    lifecycleMethodFiles.forEach(file => {
      const relativePath = path.relative(rootDir, file);
      markdownReport += `### ${relativePath}\n\n`;
      
      const methods = Object.keys(lifecycleMethods[file]);
      methods.forEach(method => {
        markdownReport += `#### ${method}\n\n`;
        markdownReport += '```jsx\n';
        lifecycleMethods[file][method].forEach(line => {
          markdownReport += `${line}\n`;
        });
        markdownReport += '```\n\n';
        
        markdownReport += 'Hook equivalent:\n';
        switch (method) {
          case 'componentDidMount':
            markdownReport += '```jsx\nuseEffect(() => {\n  // componentDidMount code\n}, []);\n```\n\n';
            break;
          case 'componentDidUpdate':
            markdownReport += '```jsx\nuseEffect(() => {\n  // componentDidUpdate code\n  // Be sure to add the appropriate dependencies\n}, [dependencies]);\n```\n\n';
            break;
          case 'componentWillUnmount':
            markdownReport += '```jsx\nuseEffect(() => {\n  return () => {\n    // componentWillUnmount code\n  };\n}, []);\n```\n\n';
            break;
          default:
            markdownReport += 'This lifecycle method requires careful analysis for conversion to hooks.\n\n';
        }
      });
    });
  }
  
  // Step-by-step modernization guide
  markdownReport += '## Modernization Guide\n\n';
  markdownReport += '### Converting Class Components to Function Components\n\n';
  markdownReport += 'Follow these steps to convert class components to function components:\n\n';
  markdownReport += '1. **Start with a stateless component first** to get familiar with the process\n';
  markdownReport += '2. **Replace the class declaration**:\n\n';
  markdownReport += '   ```jsx\n';
  markdownReport += '   // From this:\n';
  markdownReport += '   class MyComponent extends React.Component {\n';
  markdownReport += '     render() {\n';
  markdownReport += '       return <div>{this.props.text}</div>;\n';
  markdownReport += '     }\n';
  markdownReport += '   }\n\n';
  markdownReport += '   // To this:\n';
  markdownReport += '   function MyComponent(props) {\n';
  markdownReport += '     return <div>{props.text}</div>;\n';
  markdownReport += '   }\n';
  markdownReport += '   ```\n\n';
  markdownReport += '3. **Convert state**:\n\n';
  markdownReport += '   ```jsx\n';
  markdownReport += '   // From this:\n';
  markdownReport += '   class Counter extends React.Component {\n';
  markdownReport += '     constructor(props) {\n';
  markdownReport += '       super(props);\n';
  markdownReport += '       this.state = { count: 0 };\n';
  markdownReport += '     }\n';
  markdownReport += '     increment = () => {\n';
  markdownReport += '       this.setState({ count: this.state.count + 1 });\n';
  markdownReport += '     };\n';
  markdownReport += '     render() {\n';
  markdownReport += '       return (\n';
  markdownReport += '         <div>\n';
  markdownReport += '           Count: {this.state.count}\n';
  markdownReport += '           <button onClick={this.increment}>Increment</button>\n';
  markdownReport += '         </div>\n';
  markdownReport += '       );\n';
  markdownReport += '     }\n';
  markdownReport += '   }\n\n';
  markdownReport += '   // To this:\n';
  markdownReport += '   function Counter() {\n';
  markdownReport += '     const [count, setCount] = useState(0);\n';
  markdownReport += '     const increment = () => {\n';
  markdownReport += '       setCount(count + 1);\n';
  markdownReport += '     };\n';
  markdownReport += '     return (\n';
  markdownReport += '       <div>\n';
  markdownReport += '         Count: {count}\n';
  markdownReport += '         <button onClick={increment}>Increment</button>\n';
  markdownReport += '       </div>\n';
  markdownReport += '     );\n';
  markdownReport += '   }\n';
  markdownReport += '   ```\n\n';
  markdownReport += '4. **Convert lifecycle methods**:\n\n';
  markdownReport += '   ```jsx\n';
  markdownReport += '   // From this:\n';
  markdownReport += '   componentDidMount() {\n';
  markdownReport += '     fetchData();\n';
  markdownReport += '   }\n';
  markdownReport += '   componentDidUpdate(prevProps) {\n';
  markdownReport += '     if (prevProps.id !== this.props.id) {\n';
  markdownReport += '       fetchData();\n';
  markdownReport += '     }\n';
  markdownReport += '   }\n';
  markdownReport += '   componentWillUnmount() {\n';
  markdownReport += '     cleanup();\n';
  markdownReport += '   }\n\n';
  markdownReport += '   // To this:\n';
  markdownReport += '   useEffect(() => {\n';
  markdownReport += '     fetchData();\n';
  markdownReport += '     return () => {\n';
  markdownReport += '       cleanup();\n';
  markdownReport += '     };\n';
  markdownReport += '   }, [id]);\n';
  markdownReport += '   ```\n\n';
  
  // Save the report
  const reportPath = path.join(rootDir, 'docs', 'component-modernization-report.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, markdownReport);
  log.success(`Report saved to ${reportPath}`);
  
  return reportPath;
}

// Main function
async function main() {
  try {
    log.title('REACT COMPONENT MODERNIZATION ANALYSIS');
    
    const classComponents = findClassComponents();
    const lifecycleMethods = findLifecycleMethods();
    
    const reportPath = generateReport(classComponents, lifecycleMethods);
    
    log.title('MODERNIZATION ANALYSIS COMPLETE');
    log.info(`Report generated at ${reportPath}`);
    log.info('Next steps:');
    log.info('1. Review the report for components that need modernization');
    log.info('2. Start with the simplest components first');
    log.info('3. Use the provided hook equivalents as a guide');
    log.info('4. Test each component after modernization');
    
  } catch (error) {
    log.error('An error occurred during analysis:');
    log.error(error.message);
    process.exit(1);
  }
}

// Run the main function
main(); 