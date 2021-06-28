module.exports = function(RED) {
    "use strict";

    var coap = require('coap');
    var cbor = require('cbor');
    var url = require('uri-js');
    var linkFormat = require('h5.linkformat');

    coap.registerFormat('application/cbor', 60);

    function CoapRequestNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;

        this.serverConfig = RED.nodes.getNode(n.server);
        
        // copy "coap request" configuration locally
        node.options = {};
        node.options.method = n.method;
        node.options.observe = n.observe;
        node.options.name = n.name;
        node.options.url = n.url;
        node.options.contentFormat = n['content-format'];
        node.options.rawBuffer = n['raw-buffer'];

        function _constructPayload(msg, contentFormat) {
            var payload = null;

            if (contentFormat === 'text/plain') {
                payload = msg.payload;
            } else if (contentFormat === 'application/json') {
                payload = JSON.stringify(msg.payload);
            } else if (contentFormat === 'application/cbor') {
                payload = cbor.encode(msg.payload);
            }

            return payload;
        }

        function _makeRequest(msg, server) {
            var reqOpts;
            if (msg.ip_address && msg.path) {
                let uri = "";
                if (!msg.ip_address.startsWith("coap://")) {
                    uri += "coap://";
                }

                if (!msg.ip_address.startsWith("[")) {
                    uri += "[" + msg.ip_address + "]";
                } else {
                    uri += msg.ip_address;
                }

                uri += ":" + server.options.port;

                if (!msg.path.startsWith("/")) {
                    uri += "/";
                }
                uri += msg.path;
                reqOpts = url.parse(uri);
            } else {
                reqOpts = url.parse(node.options.url || msg.url);
            }
            reqOpts.pathname = reqOpts.path;
            reqOpts.method = ( node.options.method || msg.method || 'GET' ).toUpperCase();
            reqOpts.headers = {};
            reqOpts.headers['Content-Format'] = node.options.contentFormat;

            function _onResponse(res) {

                function _send(payload) {
                    node.send(Object.assign({}, msg, {
                        payload: payload,
                        headers: res.headers,
                        statusCode: res.code,
                    }));
                }

                function _onResponseData(data) {
                    if ( node.options.rawBuffer ) {
                        _send(data);
                    } else if (res.headers['Content-Format'] === 'text/plain') {
                        _send(data.toString('base64'));
                    } else if (res.headers['Content-Format'] === 'application/json') {
                        _send(JSON.parse(data.toString()));
                    } else if (res.headers['Content-Format'] === 'application/cbor') {
                        cbor.decodeAll(data, function (err, data) {
                            if (err) {
                                return false;
                            }
                            _send(data[0]);
                        });
                    } else if (res.headers['Content-Format'] === 'application/link-format') {
                        _send(linkFormat.parse(data.toString()));
                    } else {
                        _send(data.toString());
                    }
                }

                res.on('data', _onResponseData);

                if (reqOpts.observe) {
                    node.stream = res;
                }
            }

            var payload = _constructPayload(msg, node.options.contentFormat);

            if (node.options.observe === true) {
                reqOpts.observe = '1';
            } else {
                delete reqOpts.observe;
            }

            //TODO: should revisit this block
            if (node.stream) {
                node.stream.close();
            }

/*            var coapTiming = {
                ackTimeout: parseInt(server.options.ackTimeout, 10),
                ackRandomFactor: parseInt(server.options.ackRandomFactor, 10),
                maxRetransmit: parseInt(server.options.maxRetransmit, 10),
                maxLatency: parseInt(server.options.maxLatency, 10),
                piggybackReplyMs: parseInt(server.options.piggybackReplyMs, 10)
              };
            console.log(coapTiming);
            coap.updateTiming(coapTiming);
*/
            var req = coap.request(reqOpts);
            req.on('response', _onResponse);
            req.on('error', function(err) {
                const msg_error = {
                  description: 'timeout',
                  code: err 
                }
                node.send(Object.assign({}, msg, {
                  payload: msg_error,
                  statusCode: 504
                }));
            });
            //req.on('error', function(err) {
		//const msg_error = {
		  //description: 'client error',
		  //code: err
		//}
		//node.log('client error')
                //node.send(Object.assign({}, msg, {
                  //payload: msg_error,
                  //statusCode: 504
                //}));
            //});

            if (payload) {
                req.write(payload);
            }
            req.end();
        }

        this.on('input', function(msg) {
            _makeRequest(msg, this.serverConfig);
        });
    }
    RED.nodes.registerType("coap request", CoapRequestNode);
};
