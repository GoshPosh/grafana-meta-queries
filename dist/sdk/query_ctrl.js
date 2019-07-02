///<reference path="../../headers/common.d.ts" />
System.register([], function(exports_1) {
    var QueryCtrl;
    return {
        setters:[],
        execute: function() {
            QueryCtrl = (function () {
                function QueryCtrl($scope, $injector) {
                    this.$scope = $scope;
                    this.$injector = $injector;
                    this.panel = this.panelCtrl.panel;
                }
                QueryCtrl.prototype.refresh = function () {
                    this.panelCtrl.refresh();
                };
                return QueryCtrl;
            })();
            exports_1("QueryCtrl", QueryCtrl);
        }
    }
});
//# sourceMappingURL=query_ctrl.js.map