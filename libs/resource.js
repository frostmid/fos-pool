var	_ = require ('lodash'),
	Q = require ('q'),

	mixin = require ('fos-mixin');

module.exports = function Resource (resources, origin, id) {
	this.resources = resources;
	this.origin = origin;
	this.id = id;

	this.change = _.bind (this.change, this);
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	tag: 'resource',

	fetch: function () {
		return this.resources.resolve (this.origin, this.id);
	},

	fetched: function (source) {
		if (this.source) {
			this.source.removeListener ('change', this.change);
		}

		(this.source = source)
			.lock (this)
			.on ('change', this.change);
	},

	change: function () {
		this.emit ('change');
	},

	get: function (key) {
		switch (key) {
			case '_id':
				return this.id;

			default:
				return this.source.data [key];
		}
	},

	set: function () {
		var data;
		if (arguments.length == 2) {
			data = {};
			data [arguments [0]] = arguments [1];
		} else {
			data = arguments [0];
		}

		_.extend (this.source.data, data);
	},

	save: function (data) {
		if (data) {
			this.set (data);
		}

		return this.source.save (this.origin)
			.then (this.isReady)
	},

	remove: function () {
		return this.source.remove (this.origin);
	},

	stringify: function () {
		return JSON.stringify (this.source.data);
	},

	dispose: function () {
		this.resources.unset (this);
		this.removeAllListeners ();

		if (this.source) {
			this.source
				.removeListener ('change', this.change)
				.release (this);
		}

		this.cleanup ();
	},

	has: function (key) {
		return this.source.data [key] != undefined;
	},

	json: function () {
		var result = _.extend ({
			_id: this.id
		}, this.source.data);

		if (this._type) {
			result._type = this._type.json ();
		}

		if (this._prefetch) {
			var prefetch = [];
			
			_.each (this._prefetch, function (value, index) {
				if (!value) return;

				if (value.json) {
					prefetch [index] = value.json ();
				} else {
					prefetch [index] = [];

					_.each (value, function (model) {
						prefetch [index].push (model.json ());
					});
				}
			});

			result._prefetch = prefetch;
		}

		return result;
	},

	cleanup: function () {
		this.source = null;
		this.changes = null;
		this.resources = null;
	}
});
