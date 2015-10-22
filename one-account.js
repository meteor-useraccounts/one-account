config = new ReactiveDict("oneAccountConfig");
config.setDefault({
	"sendVerificationEmail": "inherit",
});

OneAccount = {
	config: function oneAccountConfig(options) {
		if (Meteor.isServer) {
			config.set(options);
		}
	},
	configure: function oneAccountConfigure(...args) {
		this.config(args);
	}
}
