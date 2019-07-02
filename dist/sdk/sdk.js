System.register(['./query_ctrl', 'app/core/config'], function(exports_1) {
    var query_ctrl_1, config_1;
    function loadPluginCss(options) {
        if (config_1["default"].bootData.user.lightTheme) {
            System.import(options.light + '!css');
        }
        else {
            System.import(options.dark + '!css');
        }
    }
    exports_1("loadPluginCss", loadPluginCss);
    return {
        setters:[
            function (query_ctrl_1_1) {
                query_ctrl_1 = query_ctrl_1_1;
            },
            function (config_1_1) {
                config_1 = config_1_1;
            }],
        execute: function() {
            exports_1("QueryCtrl", query_ctrl_1.QueryCtrl);
        }
    }
});
//# sourceMappingURL=sdk.js.map