function emailObjectFromService(serviceName = "", serviceData) {
	switch (serviceName) {
		case "facebook":
			const emailObject = {
				address: serviceData.email,
			};
			if (serviceData.email) {
				emailObject.verified = true;
			}
			return emailObject;
		case "google":
			return {
				address: serviceData.email,
				verified: serviceData.verified_email,
			};
		case "github":
			const primaryEmail = _.findWhere(serviceData.emails, { primary: true });
			if (primaryEmail) {
				return {
					address: primaryEmail.email,
					verified: primaryEmail.verified,
				};
			} else {
				return {
					address: serviceData.email,
				};
			}
		case "linkedin":
			return {
				address: serviceData.emailAddress,
				verified: true,
			};
	}
}

function addServiceEmailToUser(user) {
	let service = "";

	if (user.services && user.services.facebook) {
		service = "Facebook";
	} else if (user.services && user.services.google) {
		service = "Google";
	} else if (user.services && user.services.github) {
		service = "GitHub";
	} else if (user.services && user.services.linkedin) {
		service = "LinkedIn"
	}

	const emailObject = emailObjectFromService(service.toLowerCase(), user.services[service.toLowerCase()]);

	if (emailObject) {
		if (!emailObject.address) {
			throw new Meteor.Error(403, `The ${service} account didn't provide an email.`);
		}

		if (!user.emails) {
			user.emails = [];
		}

		user.emails.push(emailObject);
	}

	return user;
}

const originalUpdateOrCreateUserFromExternalService = Accounts.updateOrCreateUserFromExternalService;

Accounts.updateOrCreateUserFromExternalService = function(serviceName, serviceData, options) {
	if (serviceName === "password" || serviceName === "resume") {
		throw new Error(`Can't use updateOrCreateUserFromExternalService with internal service ${serviceName}`);
	}

	if (!_.has(serviceData, "id")) {
		throw new Error(`Service data for service ${serviceName} must include id`);
	}

	function cancelLogin(message) {
		return {
			error: new Meteor.Error(Accounts["LoginCancelledError"].numericError, message),
			type: serviceName,
		};
	}

	const serviceEmailObject = emailObjectFromService(serviceName, serviceData);

	function addOrUpdateEmailAndCheckIfVerified(user) {
		// If service didn't provide an email don't try and add it, return true
		// to prevent addAndOrVerifyEmail from sending a verification email
		if (!serviceEmailObject.address) {
			return true;
		}

		const currentEmailObject = _.findWhere(user.emails, {
			address: serviceEmailObject.address,
		});

		if (!currentEmailObject) {
			Meteor.users.update(user._id, {
				$push: {
					emails: serviceEmailObject,
				},
			});
			user.emails.push(serviceEmailObject);
			return serviceEmailObject.verified;
		}

		if (currentEmailObject.verified) {
			return true;
		}

		if (!serviceEmailObject.verified) {
			return false;
		}

		Meteor.users.update({
			_id: user._id,
			"emails.address": serviceEmailObject.address,
		}, {
			$set: {
				"emails.$.verified": true,
			},
			$pull: {
				"services.email.verificationTokens": {
					address: serviceEmailObject.address,
				}
			},
		});

		currentEmailObject.verified = true;
		return true;
	}

	function addAndOrVerifyEmail(user) {
		try {
			const sendVerificationEmail = Package["accounts-password"] && (config.equals("sendVerificationEmail", "inherit") && Accounts._options.sendVerificationEmail || config.get("sendVerificationEmail"));
			if (!addOrUpdateEmailAndCheckIfVerified(user) && sendVerificationEmail) {
				Accounts.sendVerificationEmail(
					user._id,
					serviceEmailObject.address,
				);
			}
		} catch (e) {
			if (e.name !== "MongoError") throw e;
			if (e.code !== 11000) throw e;
			if (e.err.indexOf("emails.address") !== -1)
				throw new Meteor.Error(403, `Email provided by ${serviceName} is used by another account.`);
			throw e;
		}
	}

	function addServiceToUser(user) {
		// Add service id to user, original updateOrCreate... function
		// will update the service data
		const modifier: any = {
			$set: {
				[`services.${serviceName}.id`]: serviceData.id,
			},
		};

		Meteor.users.update(user._id, modifier);

		addAndOrVerifyEmail(user);
	}

	if (!serviceEmailObject) {
		throw new Error("Unsupported service");
	}

	const currentUser = Meteor.user();

	// Already logged in
	if (currentUser) {

		// Current user is already connected with this service
		if (currentUser.services[serviceName]) {

			// Current user is already connected with this service account
			if (currentUser.services[serviceName].id === serviceData.id) {

				addAndOrVerifyEmail(currentUser);

				// Update service data as usual
				// i.e. call original updateOrCreate... function
				// Called at end of this function

			}
			// Current user isn't connected with this service account
			else {

				// Login or create new account based on service account
				// i.e. call original updateOrCreate... function
				// Called at end of this functionn

			}

		}
		// Current user isn't connected with this service
		else {

			const selector = {
				_id: { $ne: currentUser._id },
				[`services.${serviceName}.id`]: serviceData.id,
			};

			const otherUserWithThisServiceId = Meteor.users.findOne(selector);

			// Another user is connected with this service account
			if (otherUserWithThisServiceId) {

				addAndOrVerifyEmail(otherUserWithThisServiceId);

				// Login with this service account and switch the logged in user in
				// the app
				// i.e. call original updateOrCreate... function
				// Called at end of this function

			}
			// No other user is connected with this service account, lets add it to
			// the current user unless there's another user with the email provided
			// by the service
			else {

				const selector = {
					_id: { $ne: currentUser._id },
					"emails.address": serviceEmailObject.address,
				};

				const otherUserWithThisEmail = Meteor.users.findOne(selector);

				// Another user have this email, add service account to that account
				// and login with that account only if service provide verified email
				if (otherUserWithThisEmail && serviceEmailObject.verified) {

					// Add service id to user, original updateOrCreate... function
					// will update the service data
					const selector = {
						_id: otherUserWithThisEmail._id,
						[`services.${serviceName}`]: { $exists: false },
					};

					const modifier: any = {
						$set: {
							[`services.${serviceName}.id`]: serviceData.id,
						},
					};

					const affectedRows = Meteor.users.update(selector, modifier);

					// The service account was added to the current user
					if (affectedRows) {

						addAndOrVerifyEmail(otherUserWithThisEmail);

						// Login based on service account
						// i.e. call original updateOrCreate... function
						// Called at end of this function

					}
					// The service account wasn't added to current user, abort
					// User is already connected with this service
					else {

						// Abort login as service couldn't be added to the user,
						// We don't wanna create a new user with this service
						// Don't call original updateOrCreate... function
						return cancelLogin(`User is already connected with a "${serviceName}" account, aborting login`);

					}

				}
				// No other user have this email, add service account to current user
				else if (!otherUserWithThisEmail) {

					// Add service id to user, original updateOrCreate... function
					// will update the service data
					addServiceToUser(currentUser);

					// Update service data as usual
					// i.e. call original updateOrCreate... function
					// Called at end of this function

				}

			}

		}

	}
	// Login attempt
	else {

		const selector = {
			[`services.${serviceName}.id`]: serviceData.id,
		};

		const user = Meteor.users.findOne(selector);

		// A user is connected with this service account
		if (user) {

			addAndOrVerifyEmail(user);

			// Update service data as usual
			// i.e. call original updateOrCreate... function
			// Called at end of this function

		}
		// No user is connected with this service account
		else {

			// Check if there's a user with this email which isn't connected with
			// this service
			const selector = {
				"emails.address": serviceEmailObject.address,
				[`services.${serviceName}`]: { $exists: false },
			};

			const otherUser = Meteor.users.findOne(selector);

			// A user with this email which isn't already connected with this
			// service exist, connect it with this service account
			if (otherUser && serviceEmailObject.verified) {
				addServiceToUser(otherUser);
			}
			// No user with this email that isn't already connected with
			// this service account exists, a user with this email which is already
			// connected with this service account might exist
			else if (!otherUser) {

				const result = originalUpdateOrCreateUserFromExternalService.apply(this, arguments);

				if (result && result.userId) {
					const user = Meteor.users.findOne(result.userId);
					user && addAndOrVerifyEmail(user);
				}

				return result;

			}

		}

	}

	// Call original updateOrCreate... function
	return originalUpdateOrCreateUserFromExternalService.apply(this, arguments);
}

Meteor.startup(function() {
	const originalOnCreateUserHook = Accounts._onCreateUserHook;

	Accounts._onCreateUserHook = function(options, user) {
		user = addServiceEmailToUser(user);

		if (originalOnCreateUserHook) {
			user = originalOnCreateUserHook.call(this, options, user);
		}

		return user;
	}
});
