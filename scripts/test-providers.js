// ================================================================
// *** PROVIDER TEST — Test all AI providers end-to-end ***
// ================================================================
// Usage:
//   node scripts/test-providers.js                     # Test all configured providers
//   node scripts/test-providers.js --provider=gemini    # Test specific provider
//   node scripts/test-providers.js --topic="Cooking"    # Custom topic
//   node scripts/test-providers.js --verbose            # Show raw responses
// ================================================================

const args = parseArgs();
const TOPIC = args.topic || 'Shopping for clothes';
const LEVEL = args.level || 'beginner';
const VERBOSE = args.verbose || false;
const SPECIFIC_PROVIDER = args.provider || null;

const providers = SPECIFIC_PROVIDER ? [SPECIFIC_PROVIDER] : ['gemini', 'groq', 'qwen'];

async function run() {
  console.log('=== AI Provider Test ===');
  console.log('Topic:', TOPIC);
  console.log('Level:', LEVEL);
  console.log('');

  for (const providerName of providers) {
    await testProvider(providerName);
  }
}

async function testProvider(name) {
  console.log('─── Testing: ' + name.toUpperCase() + ' ───');

  const apiKey = process.env[name.toUpperCase() + '_API_KEY'];
  if (!apiKey) {
    console.log('  ⏭  SKIPPED — No ' + name.toUpperCase() + '_API_KEY set');
    console.log('');
    return;
  }

  const config = {
    AI_PROVIDER: name,
    AI_FALLBACK_PROVIDER: '',
    AI_TIMEOUT_MS: 30000,
    AI_API_RETRIES: 1,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    QWEN_API_KEY: process.env.QWEN_API_KEY,
    GEMINI_MODEL: 'gemini-2.0-flash',
    GROQ_MODEL: 'mixtral-8x7b-32768',
    QWEN_MODEL: 'qwen-turbo',
    MAX_RETRIES: 2,
    DEBUG_MODE: false
  };

  const { getProvider } = await import('../worker/src/providers/registry.js');

  let provider;
  try {
    provider = getProvider(config);
  } catch (err) {
    console.log('  ❌ Provider init failed:', err.message);
    console.log('');
    return;
  }

  console.log('  Model: ' + (config[name.toUpperCase() + '_MODEL']));
  console.log('  Key: ' + apiKey.slice(0, 8) + '...' + apiKey.slice(-4));

  const prompts = {
    system: 'You are a JSON generator. Output ONLY a valid JSON object with keys: meta, hook.',
    user: 'Generate a mini lesson JSON for topic: "' + TOPIC + '". Level: ' + LEVEL + '. Keep it minimal — just meta and hook fields.'
  };

  const startTime = Date.now();

  try {
    const result = await provider.generateWithRetry(prompts, {
      apiRetries: 1,
      timeout: 30000
    });

    const elapsed = Date.now() - startTime;
    console.log('  ✅ SUCCESS');
    console.log('  Provider: ' + result.provider);
    console.log('  Model: ' + result.model);
    console.log('  Latency: ' + result.latency + 'ms (' + elapsed + 'ms wall)');
    console.log('  Finish reason: ' + result.finishReason);

    if (result.usage) {
      console.log('  Tokens: ' + (result.usage.totalTokens || '?') + ' (prompt: ' + (result.usage.promptTokens || '?') + ', completion: ' + (result.usage.completionTokens || '?') + ')');
    }

    // Validate JSON output
    try {
      const parsed = JSON.parse(result.text);
      const keys = Object.keys(parsed);
      console.log('  JSON keys: ' + keys.join(', '));
      console.log('  JSON valid: ✅');
    } catch (parseErr) {
      console.log('  JSON valid: ❌ — ' + parseErr.message);
      if (VERBOSE) console.log('  Raw: ' + result.text.slice(0, 300));
    }

    console.log('');
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.log('  ❌ FAILED after ' + elapsed + 'ms');
    console.log('  Error: ' + err.message);
    if (err.statusCode) console.log('  Status: ' + err.statusCode);
    if (err.retryable !== undefined) console.log('  Retryable: ' + err.retryable);
    console.log('');
  }
}

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(function(arg) {
    if (arg.startsWith('--')) {
      const parts = arg.slice(2).split('=');
      args[parts[0]] = parts.length > 1 ? parts.slice(1).join('=') : true;
    }
  });
  return args;
}

run().catch(function(err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
