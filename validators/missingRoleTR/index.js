'use strict';
var path = require('path');
var osmium = require('osmium');
var buffered_writer = require('buffered-writer');
var turf = require('@turf/turf');
var _ = require('underscore');

module.exports = function(pbfFile, output) {
  var stream = buffered_writer.open(output);
  var relationsMemb = {};
  var relNodes = {};
  var relWays = {};
  var relations = {};
  var modes = {};
  var ways = {};
  var handlerA = new osmium.Handler();
  handlerA.on('relation', function(relation) {
    if (relation.tags('type') === 'restriction') {
      var tr = {
        from: false,
        to: false,
        via: false
      }
      relation.members().filter(function(member) {
        tr[member.role] = member;
      });
      var elems = _.without(_.values(tr), false);
      if (elems.length < 3) {
        relations[relation.id] = _.extend({
          id: relation.id,
          version: relation.version,
          changeset: relation.changeset,
          uid: relation.uid,
          user: relation.user
        }, relation.tags(), {
          members: elems
        });
        for (var i = 0; i < elems.length; i++) {
          elems[i].relation = relation.id;
          if (elems[i].type === 'n') {
            relNodes[elems[i].ref] = elems[i];
          }
          if (elems[i].type === 'w') {
            relWays[elems[i].ref] = elems[i];
          }
        }
      }
    }
  });
  var reader = new osmium.BasicReader(pbfFile);
  osmium.apply(reader, handlerA);

  var handlerB = new osmium.Handler();
  handlerB.on('node', function(node) {
    if (relNodes[node.id]) {
      var properties = _.extend(node.tags(), relNodes[node.id]);
      var feature = {
        type: 'Feature',
        properties: properties,
        geometry: node.geojson()
      };
      if (relationsMemb[properties.relation]) {
        relationsMemb[properties.relation].push(feature);
      } else {
        relationsMemb[properties.relation] = [feature];
      }
    }
  });

  var reader = new osmium.Reader(pbfFile);
  osmium.apply(reader, handlerB);

  var handlerC = new osmium.Handler();
  handlerC.on('way', function(way) {
    if (relWays[way.id]) {
      var properties = _.extend(way.tags(), relWays[way.id]);
      var feature = {
        type: 'Feature',
        properties: properties,
        geometry: way.geojson()
      };
      if (relationsMemb[properties.relation]) {
        relationsMemb[properties.relation].push(feature);
      } else {
        relationsMemb[properties.relation] = [feature];
      }
    }
  });

  var reader = new osmium.Reader(pbfFile);
  var location_handler = new osmium.LocationHandler();
  osmium.apply(reader, location_handler, handlerC);

  handlerC.on('done', function() {
    for (var rel in relationsMemb) {
      var fc = {
        type: "FeatureCollection",
        features: relationsMemb[rel]
      };
      var line = turf.polygonToLineString(turf.bboxPolygon(turf.bbox(fc)));
      line.properties = _.extend(relations[rel], {
        relations: relationsMemb[rel]
      });
      stream.write(JSON.stringify(line) + " \n");
    }
    stream.close();
  });

  handlerA.end();
  handlerB.end();
  handlerC.end();
};