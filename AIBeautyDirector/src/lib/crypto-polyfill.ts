import * as ExpoCrypto from 'expo-crypto';

// React Native has no WebCrypto. auth-js uses crypto.getRandomValues for the PKCE verifier and
// crypto.subtle.digest('SHA-256') for the S256 challenge; without them it falls back to Math.random + 'plain'.
// Web already has crypto, so this only fills it in on native. Import before creating the Supabase client.
if (typeof globalThis.crypto === 'undefined') {
  const polyfill = {
    getRandomValues: ExpoCrypto.getRandomValues,
    subtle: {
      digest: (algorithm: string, data: BufferSource) => {
        if (algorithm !== 'SHA-256') throw new Error(`digest: unsupported ${algorithm}`);
        return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
      },
    },
  };
  Object.defineProperty(globalThis, 'crypto', { value: polyfill, configurable: true });
}
