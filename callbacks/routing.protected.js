// eslint-disable-next-line no-undef
const path = Runtime.getAssets()["/providers/customers.js"].path;
const { findWorkerForCustomer, findRandomWorker } = require(path);

exports.handler = async function (context, event, callback) {
  console.log("Handling custom routing callback.");

  const client = context.getTwilioClient();

  try {
    const conversationSid = event.ConversationSid;
    const customerNumber = event["MessagingBinding.Address"].replace(
      "whatsapp:",
      ""
    );

    const workerIdentity = await routeConversation(
      context,
      conversationSid,
      customerNumber
    );
    const resp = await routeConversationToWorker(
      client,
      conversationSid,
      workerIdentity
    );

    // Remove chatbot from the conversation
    if (event.WebhookSid) {
      await client.conversations
        .conversations(conversationSid)
        .webhooks(event.WebhookSid)
        .remove();
    }

    callback(null, resp);
  } catch (err) {
    callback(err);
  }
};

const routeConversation = async (context, conversationSid, customerNumber) => {
  let workerIdentity = await findWorkerForCustomer(context, customerNumber);

  if (!workerIdentity) {
    // customer doesn't have a worker
    // Select a random worker
    console.log("No assigned worker found, selecting a random worker.");
    workerIdentity = await findRandomWorker(context);

    // Or you can define default worker for unknown customers.
    // workerIdentity = 'john@example.com'

    if (!workerIdentity) {
      throw new Error(
        `Routing failed, please add workers to customersToWorkersMap or define a default worker. Conversation SID: ${conversationSid}`
      );
    }
  }

  return workerIdentity;
};

const routeConversationToWorker = async (
  client,
  conversationSid,
  workerIdentity
) => {
  // Add worker to the conversation with a customer
  await client.conversations
    .conversations(conversationSid)
    .participants.create({ identity: workerIdentity })
    .then((participant) =>
      console.log("Created agent participant: ", participant.sid)
    )
    .catch((err) => console.log(`Failed to create agent participant: ${err}`));
};
