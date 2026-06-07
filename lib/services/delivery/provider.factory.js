import * as mock from "./providers/mock.provider.js";

const providers = {
  mock,
  shexpress: mock, // fallback until real integration
};

export function getProvider() {
  const name = process.env.DELIVERY_PROVIDER || "mock";

  return providers[name] || providers.mock;
}
