module.exports = ({ config }) => {
  const onesignalAppId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
  if (!onesignalAppId) {
    throw new Error('Missing EXPO_PUBLIC_ONESIGNAL_APP_ID');
  }

  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      onesignalAppId,
    },
    plugins: (config.plugins || []).map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === 'onesignal-expo-plugin') {
        return [
          'onesignal-expo-plugin',
          {
            ...(plugin[1] || {}),
            onesignalAppId,
          },
        ];
      }
      return plugin;
    }),
  };
};
