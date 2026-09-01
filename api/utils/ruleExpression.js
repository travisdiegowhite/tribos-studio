/**
 * A tiny, safe expression language for coaching-rule triggers.
 *
 * The triggers in docs/coaching-bible/coaching-rules.yaml are strings like:
 *
 *   "wellness != null && wellness.sleep <= 2 && hrvBelowBandDays == 0"
 *   "rss7d != null && rss7d.length == 7 && (mean(rss7d) / stddev(rss7d)) > 2.0"
 *
 * They are DATA, authored in a YAML file, so they are never handed to `eval`
 * or `new Function`. This module tokenises and parses them into a small AST
 * and walks it. Nothing but the operators and the two helper functions below
 * can be expressed; there is no property assignment, no indexing, no `this`,
 * and no way to reach a global.
 *
 * ── Null semantics (the part that matters) ───────────────────────────────
 *
 * JavaScript coerces `null` to 0, so `null >= 2` is `false` but `null >= -1`
 * is TRUE and `null == 0` is false while `null <= 0` is true. Left alone that
 * would fire readiness rules at athletes who have never filled in a check-in.
 * So ordering comparisons (`<`, `<=`, `>`, `>=`) are FALSE whenever either
 * side is null/undefined/NaN, and arithmetic on a null operand yields null.
 *
 * Equality is exact: `null == null` is true, `null == <anything else>` is
 * false. That is what makes `illnessFlag != true` correctly TRUE for an
 * athlete who has never reported illness — the rule wants "not known to be
 * ill", and the YAML says so by comparing against `true` rather than
 * against null.
 */

// ─── Tokeniser ───────────────────────────────────────────────────────────────

const PUNCT = ['&&', '||', '==', '!=', '<=', '>=', '(', ')', ',', '.', '<', '>', '+', '-', '*', '/', '!'];

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];

    if (/\s/.test(c)) { i++; continue; }

    // Number (integer or decimal; no exponent form is used by the rules).
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const raw = src.slice(i, j);
      const value = Number(raw);
      if (Number.isNaN(value)) throw new Error(`Bad number "${raw}"`);
      tokens.push({ type: 'number', value });
      i = j;
      continue;
    }

    // Single- or double-quoted string. No escapes — the rules have none, and
    // silently mis-parsing one would be worse than refusing it.
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end === -1) throw new Error(`Unterminated string at ${i}`);
      tokens.push({ type: 'string', value: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type: 'name', value: src.slice(i, j) });
      i = j;
      continue;
    }

    const punct = PUNCT.find((p) => src.startsWith(p, i));
    if (!punct) throw new Error(`Unexpected character "${c}" at ${i}`);
    tokens.push({ type: 'punct', value: punct });
    i += punct.length;
  }
  tokens.push({ type: 'eof', value: null });
  return tokens;
}

// ─── Parser (recursive descent, lowest precedence first) ─────────────────────

export function parse(src) {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = () => tokens[pos];
  const at = (value) => tokens[pos].type === 'punct' && tokens[pos].value === value;
  const eat = (value) => {
    if (!at(value)) throw new Error(`Expected "${value}" but found "${tokens[pos].value}"`);
    pos++;
  };

  function binary(next, ops) {
    return function parseLevel() {
      let left = next();
      while (peek().type === 'punct' && ops.includes(peek().value)) {
        const op = tokens[pos++].value;
        left = { kind: 'binary', op, left, right: next() };
      }
      return left;
    };
  }

  function primary() {
    const token = peek();

    if (at('(')) {
      eat('(');
      const inner = expression();
      eat(')');
      return inner;
    }

    if (at('!') || at('-')) {
      const op = tokens[pos++].value;
      return { kind: 'unary', op, operand: primary() };
    }

    if (token.type === 'number' || token.type === 'string') {
      pos++;
      return { kind: 'literal', value: token.value };
    }

    if (token.type === 'name') {
      pos++;
      if (token.value === 'true') return { kind: 'literal', value: true };
      if (token.value === 'false') return { kind: 'literal', value: false };
      if (token.value === 'null') return { kind: 'literal', value: null };

      if (at('(')) {
        eat('(');
        const args = [];
        if (!at(')')) {
          args.push(expression());
          while (at(',')) { eat(','); args.push(expression()); }
        }
        eat(')');
        return { kind: 'call', name: token.value, args };
      }
      return { kind: 'identifier', name: token.value };
    }

    throw new Error(`Unexpected token "${token.value}"`);
  }

  function member() {
    let node = primary();
    while (at('.')) {
      eat('.');
      const prop = peek();
      if (prop.type !== 'name') throw new Error('Expected a property name after "."');
      pos++;
      node = { kind: 'member', object: node, property: prop.value };
    }
    return node;
  }

  const mul = binary(member, ['*', '/']);
  const add = binary(mul, ['+', '-']);
  const cmp = binary(add, ['<=', '>=', '<', '>']);
  const eq = binary(cmp, ['==', '!=']);
  const and = binary(eq, ['&&']);
  const or = binary(and, ['||']);
  const expression = or;

  const ast = expression();
  if (peek().type !== 'eof') throw new Error(`Trailing input at "${peek().value}"`);
  return ast;
}

// ─── Helper functions available to triggers ──────────────────────────────────

function numericList(value) {
  if (!Array.isArray(value)) return null;
  const nums = value.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return nums.length === value.length && nums.length > 0 ? nums : null;
}

export function mean(value) {
  const nums = numericList(value);
  if (!nums) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

/** Population standard deviation — the same one the monotony literature uses. */
export function stddev(value) {
  const nums = numericList(value);
  if (!nums) return null;
  const m = nums.reduce((s, v) => s + v, 0) / nums.length;
  const variance = nums.reduce((s, v) => s + (v - m) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

const FUNCTIONS = { mean, stddev, abs: (v) => (isNullish(v) ? null : Math.abs(v)) };

// ─── Evaluator ───────────────────────────────────────────────────────────────

function isNullish(v) {
  return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
}

function looseEquals(a, b) {
  if (isNullish(a) || isNullish(b)) return isNullish(a) && isNullish(b);
  return a === b;
}

function compare(op, a, b) {
  // The whole point: an unknown value never satisfies an ordering test.
  if (isNullish(a) || isNullish(b)) return false;
  switch (op) {
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    default: throw new Error(`Unknown comparison "${op}"`);
  }
}

function arithmetic(op, a, b) {
  if (isNullish(a) || isNullish(b)) return null;
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? null : a / b;
    default: throw new Error(`Unknown operator "${op}"`);
  }
}

/** Evaluate a parsed trigger against a RiderState-shaped scope. */
export function evaluate(node, scope) {
  switch (node.kind) {
    case 'literal':
      return node.value;

    case 'identifier': {
      const value = scope?.[node.name];
      return value === undefined ? null : value;
    }

    case 'member': {
      const object = evaluate(node.object, scope);
      if (isNullish(object)) return null;
      if (Array.isArray(object) && node.property === 'length') return object.length;
      if (typeof object !== 'object') return null;
      const value = object[node.property];
      return value === undefined ? null : value;
    }

    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new Error(`Unknown function "${node.name}"`);
      return fn(...node.args.map((a) => evaluate(a, scope)));
    }

    case 'unary': {
      const operand = evaluate(node.operand, scope);
      if (node.op === '!') return !truthy(operand);
      return isNullish(operand) ? null : -operand;
    }

    case 'binary': {
      // Short-circuit before evaluating the right side, so a guarded member
      // access like `wellness != null && wellness.sleep <= 2` is safe.
      if (node.op === '&&') {
        return truthy(evaluate(node.left, scope)) ? truthy(evaluate(node.right, scope)) : false;
      }
      if (node.op === '||') {
        return truthy(evaluate(node.left, scope)) ? true : truthy(evaluate(node.right, scope));
      }
      const left = evaluate(node.left, scope);
      const right = evaluate(node.right, scope);
      if (node.op === '==') return looseEquals(left, right);
      if (node.op === '!=') return !looseEquals(left, right);
      if (['<', '<=', '>', '>='].includes(node.op)) return compare(node.op, left, right);
      return arithmetic(node.op, left, right);
    }

    default:
      throw new Error(`Unknown node kind "${node.kind}"`);
  }
}

/** null is falsy, as are 0 and ''. Everything else follows JS. */
function truthy(v) {
  return !isNullish(v) && Boolean(v);
}

/**
 * Every top-level RiderState field a trigger reads. Used to explain a
 * non-firing rule as `missing_input` rather than `not_triggered`.
 */
export function referencedFields(node, out = new Set()) {
  switch (node.kind) {
    case 'identifier':
      out.add(node.name);
      break;
    case 'member':
      referencedFields(node.object, out);
      break;
    case 'call':
      node.args.forEach((a) => referencedFields(a, out));
      break;
    case 'unary':
      referencedFields(node.operand, out);
      break;
    case 'binary':
      referencedFields(node.left, out);
      referencedFields(node.right, out);
      break;
    default:
      break;
  }
  return out;
}

/** Parse once, then evaluate many times. */
export function compileTrigger(src) {
  const ast = parse(src);
  const fields = [...referencedFields(ast)];
  return {
    source: src,
    fields,
    test: (scope) => truthy(evaluate(ast, scope)),
  };
}
