import * as mock from "./providers/mock.provider.js";
import * as shexpress from "./providers/shexpress.provider.js";

const providers = {
  mock,
  shexpress,
};

export function getProvider() {
  const name = process.env.DELIVERY_PROVIDER || "mock";

  const provider = providers[name];

  if (!provider) {
    throw new Error(`Unknown delivery provider: ${name}`);
  }

  return provider;
}
