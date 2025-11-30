// services/expressionEvaluator.ts

interface Token {
  type: 'LITERAL' | 'VARIABLE' | 'OPERATOR' | 'LPAREN' | 'RPAREN';
  value: string | number;
}

// Epsilon for floating-point comparisons to handle precision issues
const EPSILON = 1e-10;

const OPERATORS: { [key: string]: { precedence: number; associativity: 'Left' | 'Right' } } = {
  '>': { precedence: 2, associativity: 'Left' },
  '>=': { precedence: 2, associativity: 'Left' },
  '<': { precedence: 2, associativity: 'Left' },
  '<=': { precedence: 2, associativity: 'Left' },
  '==': { precedence: 2, associativity: 'Left' },
  'AND': { precedence: 1, associativity: 'Left' },
  'OR': { precedence: 1, associativity: 'Left' },
  'NOT': { precedence: 3, associativity: 'Right' },
};

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  // Regex to capture operators, parentheses, identifiers (variables), and numbers (including negative)
  const regex = /\s*(>=|<=|==|>|<|\(|\)|[a-zA-Z_][a-zA-Z0-9_]*|-?\d+(\.\d+)?|\S)\s*/g;
  let match;

  while ((match = regex.exec(expression)) !== null) {
    const tokenStr = match[1];
    const upperToken = tokenStr.toUpperCase();

    if (!isNaN(Number(tokenStr))) {
      tokens.push({ type: 'LITERAL', value: Number(tokenStr) });
    } else if (upperToken in OPERATORS) {
      tokens.push({ type: 'OPERATOR', value: upperToken });
    } else if (tokenStr === '(') {
      tokens.push({ type: 'LPAREN', value: tokenStr });
    } else if (tokenStr === ')') {
      tokens.push({ type: 'RPAREN', value: tokenStr });
    } else if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tokenStr)) {
      tokens.push({ type: 'VARIABLE', value: tokenStr });
    } else {
      throw new Error(`Invalid token: ${tokenStr}`);
    }
  }
  return tokens;
}

function shuntingYard(tokens: Token[]): Token[] {
  const outputQueue: Token[] = [];
  const operatorStack: Token[] = [];

  for (const token of tokens) {
    if (token.type === 'LITERAL' || token.type === 'VARIABLE') {
      outputQueue.push(token);
    } else if (token.type === 'OPERATOR') {
      const op1 = token.value as string;
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1].type === 'OPERATOR'
      ) {
        const op2 = operatorStack[operatorStack.length - 1].value as string;
        if (
          (OPERATORS[op1].associativity === 'Left' && OPERATORS[op1].precedence <= OPERATORS[op2].precedence) ||
          (OPERATORS[op1].associativity === 'Right' && OPERATORS[op1].precedence < OPERATORS[op2].precedence)
        ) {
          outputQueue.push(operatorStack.pop()!);
        } else {
          break;
        }
      }
      operatorStack.push(token);
    } else if (token.type === 'LPAREN') {
      operatorStack.push(token);
    } else if (token.type === 'RPAREN') {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1].type !== 'LPAREN'
      ) {
        outputQueue.push(operatorStack.pop()!);
      }
      if (operatorStack.length === 0) {
        throw new Error('Mismatched parentheses');
      }
      operatorStack.pop(); // Pop the LPAREN
    }
  }

  while (operatorStack.length > 0) {
    const op = operatorStack.pop()!;
    if (op.type === 'LPAREN') {
      throw new Error('Mismatched parentheses');
    }
    outputQueue.push(op);
  }

  return outputQueue;
}

function evaluateRPN(rpnQueue: Token[], context: { [key: string]: number }): number {
    const stack: (number | boolean)[] = [];

    for (const token of rpnQueue) {
        if (token.type === 'LITERAL') {
            stack.push(token.value as number);
        } else if (token.type === 'VARIABLE') {
            const value = context[token.value as string];
            if (value === undefined) {
                throw new Error(`Undefined variable: ${token.value}`);
            }
            stack.push(value);
        } else if (token.type === 'OPERATOR') {
            if (token.value === 'NOT') {
                if (stack.length < 1) throw new Error('Invalid expression for NOT operator');
                const operand = stack.pop();
                stack.push(!operand ? 1 : 0);
                continue;
            }

            if (stack.length < 2) throw new Error(`Invalid expression for operator ${token.value}`);
            const b = stack.pop()!;
            const a = stack.pop()!;

            switch (token.value) {
                case '>': stack.push(a > b ? 1 : 0); break;
                case '>=': stack.push(a >= b ? 1 : 0); break;
                case '<': stack.push(a < b ? 1 : 0); break;
                case '<=': stack.push(a <= b ? 1 : 0); break;
                case '==':
                    // Use epsilon-based comparison for floating-point numbers
                    // to handle precision issues (e.g., 0.1 + 0.2 === 0.3 is false)
                    stack.push(Math.abs((a as number) - (b as number)) < EPSILON ? 1 : 0);
                    break;
                case 'AND': stack.push(a && b ? 1 : 0); break;
                case 'OR': stack.push(a || b ? 1 : 0); break;
                default: throw new Error(`Unknown operator: ${token.value}`);
            }
        }
    }

    if (stack.length !== 1) {
        throw new Error('The final expression stack is invalid');
    }
    
    return stack[0] as number;
}


/**
 * Pre-compiles an expression into RPN tokens for efficient repeated evaluation.
 * This should be called once and the result reused for many evaluations.
 */
export function compileExpression(expression: string): Token[] {
    if (!expression.trim()) throw new Error('Empty expression');
    try {
        const tokens = tokenize(expression);
        return shuntingYard(tokens);
    } catch (e) {
        if (e instanceof Error) {
            throw new Error(`Expression compilation failed: ${e.message}`);
        }
        throw new Error("An unknown error occurred during expression compilation.");
    }
}

/**
 * Evaluates pre-compiled RPN tokens with the given context.
 * Much faster than evaluate() for repeated evaluations.
 */
export function evaluateCompiled(compiledRPN: Token[], context: { [key: string]: number }): number {
    return evaluateRPN(compiledRPN, context);
}

export function evaluate(expression: string, context: { [key: string]: number }): number {
    if (!expression.trim()) return 0;
    try {
        const tokens = tokenize(expression);
        const rpn = shuntingYard(tokens);
        return evaluateRPN(rpn, context);
    } catch (e) {
        if (e instanceof Error) {
            // Rethrow with a more user-friendly message
            throw new Error(`Expression evaluation failed: ${e.message}`);
        }
        throw new Error("An unknown error occurred during expression evaluation.");
    }
}

export function getVariables(expression: string): string[] {
    try {
        const tokens = tokenize(expression);
        const variables = new Set<string>();
        for (const token of tokens) {
            if (token.type === 'VARIABLE') {
                variables.add(token.value as string);
            }
        }
        return Array.from(variables);
    } catch (e) {
        // If tokenization fails, it might be an incomplete expression. Return empty.
        return [];
    }
}
