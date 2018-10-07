## Meta Queries Plugin for Grafana:
Meta Queries plugin is built as a data source plugin and can be used in conjunction with other data source to show computed metrics like Moving Average, Time Shift.
  
## Installation
Need to clone this repo into your grafana plugins directory (default /var/lib/grafana/plugins if your installing grafana with package).
Restart grafana-server and the plugin should be automatically detected and used.

```
git clone git@github.com:GoshPosh/grafana-meta-queries.git
sudo service grafana-server restart
```  

Create a new datasource with a name and select `type` as `MetaQueries`
![Screenshot](https://raw.githubusercontent.com/GoshPosh/grafana-meta-queries/master/img/DataSourceConfig.png?raw=true "DataSource")

## Usage
* Set the Graph's data source to `MetaQueries`
* Add query of your data source (add a few more)
* Add query with `MetaQueries` as data source
* Reference other columns as `A` or `B` depending on what is shown 

## Examples
#### Arithmetic
Lets you perform arithmetic operations on one or more existing queries.
* if metric A & B has no group by, the order and size option is never used
* if metric A & B has group by, the alias option is never used
![Screenshot](https://github.com/sunnut/grafana-meta-queries/blob/master/img/addGroup.png?raw=true "Arithmetic Example 3 - Metric A with group by")

#### Moving Average
![Screenshot](https://raw.githubusercontent.com/GoshPosh/grafana-meta-queries/master/img/moving_average-ex1.png?raw=true "Moving Average Example 1 - 7 period moving average of Metric A ")

#### Time Shift
![Screenshot](https://raw.githubusercontent.com/GoshPosh/grafana-meta-queries/master/img/time_shift-ex1.png?raw=true "Time Shift Example 1 - 1 period timeshift of Metric A ")


## Compatibility
Grafana Meta Queries plugin 0.0.1 and above are supported for Grafana: 4.x.x


## Known Issues
* Moving average of moving average is not supported
* Moving average of time shift is not supported
* Time shift of Moving average is not supported
* Time shift of Time Shift is not supported

## Status
Lot of features might still not be implemented. Your contributions are welcome.

