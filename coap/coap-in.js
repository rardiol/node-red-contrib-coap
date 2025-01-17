module.exports = function(RED) {
    "use strict";
    var coap = require('coap');

    // A node red node that sets up a local coap server
    function CoapServerNode(n) {
        // Create a RED node
        RED.nodes.createNode(this,n);
        var node = this;

        // Store local copies of the node configuration (as defined in the .html)
        node.options = {};
        node.options.name = n.name;
        node.options.port = n.port;

        node.options.ackTimeout = n.ackTimeout;
        node.options.ackRandomFactor = n.ackRandomFactor;
        node.options.maxRetransmit = n.maxRetransmit;
        node.options.maxLatency = n.maxLatency;
        node.options.piggybackReplyMs = n.piggybackReplyMs;

        node._inputNodes = [];    // collection of "coap in" nodes that represent coap resources

        var coapTiming = {
            ackTimeout: parseInt(node.options.ackTimeout, 10),
            ackRandomFactor: parseInt(node.options.ackRandomFactor, 10),
            maxRetransmit: parseInt(node.options.maxRetransmit, 10),
            maxLatency: parseInt(node.options.maxLatency, 10),
            piggybackReplyMs: parseInt(node.options.piggybackReplyMs, 10),
	    sendAcksForNonConfirmablePackets: true,
	    maxPacketSize: 1280
            };
        coap.updateTiming(coapTiming);

        // Setup node-coap server and start
        node.server = new coap.createServer({ type: 'udp6' });
        node.server.on('request', function(req, res) {
            node.handleRequest(req, res);
            res.on('error', function(err) {
                node.log('server error');
                node.log(err);
            });
        });
        node.server.listen(node.options.port, function() {
            //console.log('server started');
            node.log('CoAP Server Started');
        });

        node.on("close", function() {
            node._inputNodes = [];
            node.server.close();
        });
    }
    RED.nodes.registerType("coap-server",CoapServerNode);

    CoapServerNode.prototype.registerInputNode = function(/*Node*/resource){
        var exists = false;
        for (var i = 0; i < this._inputNodes.length; i++) {
            if (this._inputNodes[i].options.url == resource.options.url &&
                this._inputNodes[i].options.method == resource.options.method) {
                exists = true;

                //TODO: Does this have any effect? Should show the error in the frontend somehow? Some kind of status bar?
                this.error("Node with the specified URL and Method already exists!");
            }
        }
        if (!exists) {
            this._inputNodes.push(resource);
        }
    };

    CoapServerNode.prototype.handleRequest = function(req, res){

        //TODO: Check if there are any matching resource. If the resource is .well-known return the resource directory to the client
        var matchResource = false;
        var matchMethod = false;
        for (var i = 0; i < this._inputNodes.length; i++) {
            if (this._inputNodes[i].options.url == req.url) {
                matchResource = true;
                if (this._inputNodes[i].options.method == req.method) {
                    matchMethod = true;
                    var inNode = this._inputNodes[i];
                    inNode.send({'req': req, 'res': res});
                }
            }
        }
        if (!matchResource) {
            res.code = '4.04';
            return res.end();
        }

        if (!matchMethod) {
            res.code = '4.05';
            return res.end();
        }
    };

    function CoapInNode(n) {
        RED.nodes.createNode(this,n);

        //copy "coap in" node configuration locally
        this.options = {};
        this.options.method = n.method;
        this.options.name = n.name;
        this.options.server = n.server;
        this.options.url = n.url.charAt(0) == "/" ? n.url : "/" + n.url;

        console.log(n.server);

        this.serverConfig = RED.nodes.getNode(this.options.server);

        if (this.serverConfig) {
            this.serverConfig.registerInputNode(this);
        } else {
            this.error("Missing server configuration");
        }

    }
    RED.nodes.registerType("coap in",CoapInNode);
};
