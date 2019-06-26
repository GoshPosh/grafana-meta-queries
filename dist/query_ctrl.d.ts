/// <reference path="../headers/common.d.ts" />
import { QueryCtrl } from './sdk/sdk';
export declare class MetaQueriesQueryCtrl extends QueryCtrl {
    static templateUrl: string;
    errors: any;
    query: any;
    metric: any;
    addAggregatorMode: boolean;
    addPostAggregatorMode: boolean;
    addDimensionsMode: boolean;
    addMetricsMode: boolean;
    listDataSources: any;
    getDimensionsAndMetrics: any;
    getMetrics: any;
    getDimensions: any;
    getTargets: any;
    getQueryLetters: any;
    queryTypes: any;
    filterTypes: any;
    aggregatorTypes: any;
    postAggregatorTypes: any;
    arithmeticPostAggregator: any;
    customGranularity: any;
    target: any;
    datasource: any;
    queryTypeValidators: {
        "TimeShift": any;
        "MovingAverage": any;
        "Arithmetic": any;
    };
    defaultQueryType: string;
    defaultPeriods: number;
    defaultTimeshiftUnit: string;
    /** @ngInject **/
    constructor($scope: any, $injector: any, $q: any);
    targetBlur(): void;
    clearPeriods(): void;
    isValidQueryType(type: any): any;
    validateMovingAverageQuery(target: any, errs: any): boolean;
    validateArithmeticQuery(target: any, errs: any): boolean;
    validateTimeShiftQuery(target: any, errs: any): boolean;
    validateTarget(): any;
}
