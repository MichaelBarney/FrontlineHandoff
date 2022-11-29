// eslint-disable-next-line no-undef
const path = Runtime.getAssets()["/providers/customers.js"].path;
const { getCustomerByNumber } = require(path);

exports.handler = async function (context, event, callback) {
  const client = context.getTwilioClient();

  const eventType = event.EventType;
  console.log(
    `Received a webhook event from Twilio Conversations: ${eventType}`
  );
  const conversationSid = event.ConversationSid;

  switch (eventType) {
    case "onConversationAdd": {
      /* PRE-WEBHOOK
       *
       * This webhook will be called before creating a conversation.
       *
       * It is required especially if Frontline Inbound Routing is enabled
       * so that when the worker will be added to the conversation, they will
       * see the friendly_name and avatar of the conversation.
       *
       * More info about the `onConversationAdd` webhook: https://www.twilio.com/docs/conversations/conversations-webhooks#onconversationadd
       * More info about handling incoming conversations: https://www.twilio.com/docs/frontline/handle-incoming-conversations
       */

      console.log("Setting conversation properties.");

      const customerNumber = event["MessagingBinding.Address"].replace(
        "whatsapp:",
        ""
      );
      const isIncomingConversation = !!customerNumber;

      if (isIncomingConversation) {
        try {
          const customerDetails =
            (await getCustomerByNumber(context, customerNumber)) || {};

          const conversationProperties = {
            friendly_name: customerDetails.display_name || customerNumber,
            attributes: JSON.stringify({
              avatar: customerDetails.avatar,
            }),
          };

          callback(null, conversationProperties);
        } catch (err) {
          callback(err);
        }
      }
      break;
    }
    case "onParticipantAdded": {
      /* POST-WEBHOOK
       *
       * This webhook will be called when a participant added to a conversation
       * including customer in which we are interested in.
       *
       * It is required to add customer_id information to participant and
       * optionally the display_name and avatar.
       *
       * More info about the `onParticipantAdded` webhook: https://www.twilio.com/docs/conversations/conversations-webhooks#onparticipantadded
       * More info about the customer_id: https://www.twilio.com/docs/frontline/my-customers#customer-id
       * And more here you can see all the properties of a participant which you can set: https://www.twilio.com/docs/frontline/data-transfer-objects#participant
       */

      const participantSid = event.ParticipantSid;
      const customerNumber = event["MessagingBinding.Address"];
      const iscustomer = customerNumber && !event.Identity;

      console.log(
        `Getting participant properties for ${customerNumber || event.Identity}`
      );

      if (iscustomer) {
        try {
          const customerParticipant = await client.conversations
            .conversations(conversationSid)
            .participants.get(participantSid)
            .fetch();

          const customerDetails =
            (await getCustomerByNumber(context, customerNumber)) || {};
          await setcustomerParticipantProperties(
            customerParticipant,
            customerDetails
          );
          callback(null, "success");
        } catch (err) {
          callback(err);
        }
      }

      break;
    }

    case "onConversationAdded": {
      // Add Studiio to Conversation
      const customerNumber = event["MessagingBinding.Address"].replace(
        "whatsapp:",
        ""
      );
      const isIncomingConversation = !!customerNumber;

      if (isIncomingConversation) {
        await client.conversations
          .conversations(conversationSid)
          .webhooks.create({
            "configuration.flowSid": "FWfd1aab48f122be2e7da0dd912889dd99",
            "configuration.replayAfter": 0,
            target: "studio",
          })
          .then((webhook) => {
            console.log(webhook.sid);
            callback(null, "Success");
          })
          .catch((err) => {
            console.log("Error Adding Studio to Conversation: ", err);
            callback(err);
          });
      }
      break;
    }
    default: {
      callback(new Error(`422 Unknown event type: ${eventType}`));
    }
  }
};

const setcustomerParticipantProperties = async (
  customerParticipant,
  customerDetails
) => {
  const participantAttributes = JSON.parse(customerParticipant.attributes);
  const customerProperties = {
    attributes: JSON.stringify({
      ...participantAttributes,
      avatar: participantAttributes.avatar || customerDetails.avatar,
      customer_id:
        participantAttributes.customer_id || customerDetails.customer_id,
      display_name:
        participantAttributes.display_name || customerDetails.display_name,
    }),
  };

  // If there is difference, update participant
  if (customerParticipant.attributes !== customerProperties.attributes) {
    // Update attributes of customer to include customer_id
    await customerParticipant
      .update(customerProperties)
      .catch((e) => console.log("Update customer participant failed: ", e));
  }
};
