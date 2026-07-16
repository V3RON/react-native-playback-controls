const { withPodfile } = require('@expo/config-plugins');

const MARKER = '# withFixDevMenuAppIconCatalog';

/**
 * Works around a CocoaPods/Xcode bug (unrelated to this library) that fails
 * `expo run:ios` / `xcodebuild` for any Expo dev-client app on current Xcode
 * toolchains:
 *
 *   error: None of the input catalogs contained a matching stickers icon
 *   set, app icon set, or icon stack named "AppIcon".
 *
 * Root cause: on current Xcode versions, `actool` defaults
 * `ASSETCATALOG_COMPILER_APPICON_NAME` to `"AppIcon"` for any asset-catalog
 * compile step where the build setting is merely *unset* — it no longer
 * skips app-icon validation in that case. Every resource-bundle Pod target
 * that ships its own `.xcassets` (notably `expo-dev-menu`'s `EXDevMenu`
 * bundle, which only has a `dev-tools` imageset) hits this default and fails,
 * even though nothing in this project ever asked it to produce an app icon.
 *
 * Confirmed by direct testing: `delete`-ing the build setting has no effect
 * (the implicit "AppIcon" default still applies); explicitly setting it to
 * `""` on the target does suppress the app-icon compile step. Only the app
 * target should keep its real `ASSETCATALOG_COMPILER_APPICON_NAME`.
 *
 * Runs once per `expo prebuild` via a `post_install` hook appended to the
 * generated Podfile.
 */
function withFixDevMenuAppIconCatalog(config) {
  return withPodfile(config, (podfileConfig) => {
    const { contents } = podfileConfig.modResults;

    if (contents.includes(MARKER)) {
      return podfileConfig;
    }

    const hookRuby = `
  ${MARKER}
  # See plugins/withFixDevMenuAppIconCatalog.js for context.
  installer.pods_project.targets.each do |target|
    next if target.respond_to?(:product_type) && target.product_type == 'com.apple.product-type.application'

    target.build_configurations.each do |build_configuration|
      build_configuration.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = ''
    end
  end
`;

    const postInstallMatch = contents.match(/post_install do \|installer\|\n/);
    if (!postInstallMatch) {
      throw new Error(
        'withFixDevMenuAppIconCatalog: could not find a `post_install do |installer|` block in the generated Podfile to patch.'
      );
    }

    const insertAt = postInstallMatch.index + postInstallMatch[0].length;
    podfileConfig.modResults.contents =
      contents.slice(0, insertAt) + hookRuby + contents.slice(insertAt);

    return podfileConfig;
  });
}

module.exports = withFixDevMenuAppIconCatalog;
