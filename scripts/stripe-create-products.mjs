#!/usr/bin/env node

/**
 * Create the Stripe Products and Prices used by PiXiEED checkout flows.
 *
 * Default mode is dry-run and does not call Stripe.
 * Use --apply to create missing live objects.
 */

const DEFAULT_PROJECT_REF = 'kyyiuakrqomzlikfaire';
const STRIPE_API_BASE = 'https://api.stripe.com/v1';

const DEFAULT_PRODUCTS = [
  {
    key: 'browser_ad_free',
    name: 'PiXiEED Browser Ad-Free',
    description: '31-day browser ad-free support for PiXiEED.',
    amount: 500,
    currency: 'jpy',
    mode: 'payment',
    lookupKey: 'pixieed_browser_ad_free_31d_v1',
    priceEnv: 'PIXIEED_STRIPE_BROWSER_ADFREE_PRICE_ID',
    metadata: {
      pixieed_product_key: 'browser_ad_free',
      pixieed_entitlement_key: 'browser_ad_free',
    },
  },
  {
    key: 'pixiedraw_ad_free',
    name: 'PiXiEEDraw Monthly Support',
    description: 'Monthly PiXiEEDraw support with ad-free and shared project benefits.',
    amount: 500,
    currency: 'jpy',
    mode: 'subscription',
    interval: 'month',
    lookupKey: 'pixiedraw_ad_free_monthly_v1',
    priceEnv: 'PIXIEED_STRIPE_PIXIEDRAW_ADFREE_PRICE_ID',
    metadata: {
      pixieed_product_key: 'pixiedraw_ad_free',
      pixieed_entitlement_key: 'pixiedraw_ad_free',
    },
  },
  {
    key: 'pixieed_support_monthly',
    name: 'PiXiEED Monthly Support',
    description: 'Monthly support for PiXiEED with PiXiEED and PiXiEEDraw supporter benefits.',
    amount: 500,
    currency: 'jpy',
    mode: 'subscription',
    interval: 'month',
    lookupKey: 'pixieed_support_monthly_v1',
    priceEnv: 'PIXIEED_STRIPE_PIXIEED_SUPPORT_MONTHLY_PRICE_ID',
    metadata: {
      pixieed_product_key: 'pixieed_support_monthly',
      pixieed_entitlement_key: 'browser_ad_free',
      pixieed_linked_entitlement_key: 'pixiedraw_ad_free',
    },
  },
  {
    key: 'support_tip',
    name: 'PiXiEED Support Tip',
    description: 'One-time support tip for PiXiEED.',
    amount: 500,
    currency: 'jpy',
    mode: 'payment',
    lookupKey: 'pixieed_support_tip_500_v1',
    priceEnv: 'PIXIEED_STRIPE_SUPPORT_TIP_PRICE_ID',
    metadata: {
      pixieed_product_key: 'support_tip',
    },
  },
];

function printUsage() {
  console.log(`Usage:
  node scripts/stripe-create-products.mjs [--dry-run]
  STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-create-products.mjs --apply

Options:
  --apply                 Create missing Stripe Products and Prices.
  --dry-run               Print the plan without calling Stripe. This is the default.
  --file <path>           Read product definitions from JSON instead of built-in defaults.
  --project-ref <ref>     Supabase project ref for printed secrets command.
  --json                  Print machine-readable JSON result.
  --help                  Show this help.

JSON file shape:
  {
    "products": [
      {
        "key": "pixiedraw_plugin_example",
        "name": "PiXiEEDraw Plugin Example",
        "description": "Example plugin.",
        "amount": 300,
        "currency": "jpy",
        "mode": "payment",
        "lookupKey": "pixiedraw_plugin_example_v1",
        "priceEnv": "PIXIEED_STRIPE_PLUGIN_EXAMPLE_PRICE_ID",
        "metadata": {
          "pixieed_product_key": "pixiedraw_plugin_example"
        }
      }
    ]
  }`);
}

function parseArgs(argv) {
  const options = {
    apply: false,
    dryRun: true,
    file: '',
    projectRef: DEFAULT_PROJECT_REF,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--apply') {
      options.apply = true;
      options.dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      options.apply = false;
      options.dryRun = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--file') {
      const next = argv[index + 1] || '';
      if (!next || next.startsWith('--')) {
        throw new Error('--file requires a path');
      }
      options.file = next;
      index += 1;
      continue;
    }
    if (arg === '--project-ref') {
      const next = argv[index + 1] || '';
      if (!next || next.startsWith('--')) {
        throw new Error('--project-ref requires a value');
      }
      options.projectRef = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function readProducts(filePath) {
  if (!filePath) {
    return DEFAULT_PRODUCTS;
  }
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.products)) {
    throw new Error('Product JSON must contain a products array');
  }
  return parsed.products;
}

function normalizeProduct(input) {
  const product = input && typeof input === 'object' ? input : {};
  const key = String(product.key || '').trim();
  const name = String(product.name || '').trim();
  const description = String(product.description || '').trim();
  const currency = String(product.currency || 'jpy').trim().toLowerCase();
  const mode = String(product.mode || 'payment').trim().toLowerCase();
  const interval = String(product.interval || '').trim().toLowerCase();
  const lookupKey = String(product.lookupKey || product.lookup_key || '').trim();
  const priceEnv = String(product.priceEnv || product.price_env || '').trim();
  const amount = Number(product.amount);
  const metadata = product.metadata && typeof product.metadata === 'object'
    ? Object.fromEntries(
      Object.entries(product.metadata)
        .map(([metaKey, metaValue]) => [String(metaKey), String(metaValue ?? '')])
        .filter(([metaKey]) => metaKey)
    )
    : {};

  if (!key) throw new Error('Product key is required');
  if (!name) throw new Error(`Product ${key}: name is required`);
  if (!Number.isInteger(amount) || amount < 50) {
    throw new Error(`Product ${key}: amount must be an integer minor-unit amount of at least 50`);
  }
  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error(`Product ${key}: currency must be a 3-letter code`);
  }
  if (!['payment', 'subscription'].includes(mode)) {
    throw new Error(`Product ${key}: mode must be payment or subscription`);
  }
  if (mode === 'subscription' && !['day', 'week', 'month', 'year'].includes(interval)) {
    throw new Error(`Product ${key}: subscription interval must be day, week, month, or year`);
  }
  if (!lookupKey) throw new Error(`Product ${key}: lookupKey is required`);
  if (!priceEnv) throw new Error(`Product ${key}: priceEnv is required`);

  return {
    key,
    name,
    description,
    amount,
    currency,
    mode,
    interval: mode === 'subscription' ? interval : '',
    lookupKey,
    priceEnv,
    metadata: {
      pixieed_product_key: key,
      ...metadata,
    },
  };
}

function readStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY
    || process.env.PIXIEED_STRIPE_SECRET_KEY
    || process.env.STRIPE_API_KEY
    || '';
}

function appendMetadata(params, metadata) {
  Object.entries(metadata || {}).forEach(([key, value]) => {
    if (!key || value === '') return;
    params.append(`metadata[${key}]`, String(value));
  });
}

async function stripeRequest(secretKey, method, path, body, idempotencyKey = '') {
  const headers = {
    authorization: `Bearer ${secretKey}`,
  };
  const init = { method, headers };

  if (body) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    init.body = body;
  }
  if (idempotencyKey && method !== 'GET') {
    headers['idempotency-key'] = idempotencyKey;
  }

  const response = await fetch(`${STRIPE_API_BASE}${path}`, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = data?.error?.message || data?.message || text || `Stripe request failed: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function findActivePriceByLookupKey(secretKey, lookupKey) {
  const params = new URLSearchParams();
  params.append('active', 'true');
  params.append('limit', '1');
  params.append('lookup_keys[]', lookupKey);
  params.append('expand[]', 'data.product');
  const data = await stripeRequest(secretKey, 'GET', `/prices?${params.toString()}`);
  const price = Array.isArray(data?.data) ? data.data[0] : null;
  return price || null;
}

async function createProduct(secretKey, product) {
  const params = new URLSearchParams();
  params.append('name', product.name);
  if (product.description) {
    params.append('description', product.description);
  }
  appendMetadata(params, product.metadata);
  const idempotencyKey = `pixieed-product-${product.lookupKey}`;
  return stripeRequest(secretKey, 'POST', '/products', params, idempotencyKey);
}

async function createPrice(secretKey, product, stripeProductId) {
  const params = new URLSearchParams();
  params.append('product', stripeProductId);
  params.append('currency', product.currency);
  params.append('unit_amount', String(product.amount));
  params.append('lookup_key', product.lookupKey);
  appendMetadata(params, product.metadata);
  if (product.mode === 'subscription') {
    params.append('recurring[interval]', product.interval);
  }
  const idempotencyKey = [
    'pixieed-price',
    product.lookupKey,
    product.amount,
    product.currency,
    product.mode,
    product.interval || 'once',
  ].join('-');
  return stripeRequest(secretKey, 'POST', '/prices', params, idempotencyKey);
}

function makePlanEntry(product) {
  return {
    key: product.key,
    name: product.name,
    amount: product.amount,
    currency: product.currency,
    mode: product.mode,
    interval: product.interval || '',
    lookupKey: product.lookupKey,
    priceEnv: product.priceEnv,
  };
}

async function applyProducts(secretKey, products) {
  const results = [];
  for (const product of products) {
    const existingPrice = await findActivePriceByLookupKey(secretKey, product.lookupKey);
    if (existingPrice?.id) {
      results.push({
        ...makePlanEntry(product),
        action: 'reuse_existing_price',
        productId: typeof existingPrice.product === 'string'
          ? existingPrice.product
          : existingPrice.product?.id || '',
        priceId: existingPrice.id,
      });
      continue;
    }

    const createdProduct = await createProduct(secretKey, product);
    const createdPrice = await createPrice(secretKey, product, createdProduct.id);
    results.push({
      ...makePlanEntry(product),
      action: 'created',
      productId: createdProduct.id,
      priceId: createdPrice.id,
    });
  }
  return results;
}

function buildSupabaseSecretsCommand(results, projectRef) {
  const lines = ['supabase secrets set \\'];
  results.forEach((result) => {
    const priceId = result.priceId || `__${result.priceEnv}__`;
    lines.push(`  ${result.priceEnv}=${priceId} \\`);
  });
  lines.push(`  --project-ref ${projectRef}`);
  return lines.join('\n');
}

function printHumanResult({ options, products, results }) {
  if (options.dryRun) {
    console.log('Dry run. No Stripe API calls were made.');
    console.log('');
    products.forEach((product) => {
      const interval = product.mode === 'subscription' ? `/${product.interval}` : '';
      console.log(`- ${product.key}: ${product.name}`);
      console.log(`  ${product.amount} ${product.currency.toUpperCase()} ${product.mode}${interval}`);
      console.log(`  lookup_key=${product.lookupKey}`);
      console.log(`  secret=${product.priceEnv}`);
    });
    console.log('');
    console.log('Apply with:');
    console.log('  STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-create-products.mjs --apply');
    console.log('');
    console.log('After apply, set Supabase price secrets with the printed command.');
    return;
  }

  console.log('Stripe product setup result:');
  results.forEach((result) => {
    console.log(`- ${result.key}: ${result.action}`);
    console.log(`  product=${result.productId}`);
    console.log(`  price=${result.priceId}`);
    console.log(`  secret=${result.priceEnv}`);
  });
  console.log('');
  console.log('Supabase secrets command:');
  console.log(buildSupabaseSecretsCommand(results, options.projectRef));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const products = (await readProducts(options.file)).map(normalizeProduct);
  const secretKey = readStripeSecretKey();
  let results = products.map((product) => ({
    ...makePlanEntry(product),
    action: 'planned',
    productId: '',
    priceId: '',
  }));

  if (options.apply) {
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY, PIXIEED_STRIPE_SECRET_KEY, or STRIPE_API_KEY is required with --apply');
    }
    results = await applyProducts(secretKey, products);
  }

  if (options.json) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: options.dryRun,
      products: products.map(makePlanEntry),
      results,
      supabaseSecretsCommand: buildSupabaseSecretsCommand(results, options.projectRef),
    }, null, 2));
    return;
  }

  printHumanResult({ options, products, results });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
