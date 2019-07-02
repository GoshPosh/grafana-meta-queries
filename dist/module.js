System.register(['./datasource', './query_ctrl', './config_ctrl'], function(exports_1) {
    var datasource_1, query_ctrl_1, config_ctrl_1;
    return {
        setters:[
            function (datasource_1_1) {
                datasource_1 = datasource_1_1;
            },
            function (query_ctrl_1_1) {
                query_ctrl_1 = query_ctrl_1_1;
            },
            function (config_ctrl_1_1) {
                config_ctrl_1 = config_ctrl_1_1;
            }],
        execute: function() {
            exports_1("Datasource", datasource_1.MetaQueriesDatasource);
            exports_1("QueryCtrl", query_ctrl_1.MetaQueriesQueryCtrl);
            exports_1("ConfigCtrl", config_ctrl_1.MetaQueriesConfigCtrl);
        }
    }
});
//# sourceMappingURL=module.js.map