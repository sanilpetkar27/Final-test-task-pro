module.exports = ({ config }) => {
  const onesignalAppId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID || 'demo-app-id';

  // Required plugins from expo install --fix
  const requiredPlugins = ['@sentry/react-native', 'expo-asset', 'expo-secure-store'];
  
  // Get existing plugins and add required ones if missing
  const existingPlugins = config.plugins || [];
  const pluginNames = existingPlugins.map(plugin => 
    Array.isArray(plugin) ? plugin[0] : plugin
  );
  
  const missingPlugins = requiredPlugins.filter(plugin => !pluginNames.includes(plugin));
  const finalPlugins = [...existingPlugins, ...missingPlugins];

  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      onesignalAppId,
    },
    plugins: finalPlugins.map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === 'onesignal-expo-plugin') {
        return [
          'onesignal-expo-plugin',
          {
            ...(plugin[1] || {}),
          },
        ];
      }
      return plugin;
    }),
  };
};
