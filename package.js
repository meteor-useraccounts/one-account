Package.describe({
	documentation: "README.md",
	git: "https://github.com/hansoft/meteor-one-account.git",
	name: "useraccounts:one-account",
	version: "0.1.0",
	summary: "One account for all account services",
});

Package.onUse(function(api) {
	api.versionsFrom("1.2");

	api.use([
		"ecmascript",
		"reactive-dict",
	]);

	api.use([
		"accounts-base",
		"underscore",
	], "server");

	api.use([
		"accounts-password",
	], "server", { weak: true });

	api.export("OneAccount");

	api.addFiles("one-account.js");
	api.addFiles("accounts.js", "server");
});
