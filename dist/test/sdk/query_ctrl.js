///<reference path="../../headers/common.d.ts" />
var QueryCtrl = (function () {
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
exports.QueryCtrl = QueryCtrl;
//# sourceMappingURL=query_ctrl.js.map