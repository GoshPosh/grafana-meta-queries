var query_ctrl_1 = require('./query_ctrl');
exports.QueryCtrl = query_ctrl_1.QueryCtrl;
var config_1 = require('app/core/config');
function loadPluginCss(options) {
    if (config_1.default.bootData.user.lightTheme) {
        System.import(options.light + '!css');
    }
    else {
        System.import(options.dark + '!css');
    }
}
exports.loadPluginCss = loadPluginCss;
//# sourceMappingURL=sdk.js.map