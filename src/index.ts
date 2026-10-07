import { google } from "googleapis";
import { authenticate } from "@google-cloud/local-auth";
import * as path from "node:path";
import * as fs from "node:fs";


function getBody(emaildata: any): string {

    if (emaildata.mimeType === "text/plain" && emaildata.body && emaildata.body.data) {
        return Buffer.from(
            emaildata.body.data,
            "base64url"
        ).toString("utf-8");
    }


    if (emaildata.parts) {

        for (let i = 0; i < emaildata.parts.length; i++) {

            const part = emaildata.parts[i];

            if (!part) {
                continue;
            }


            if (part.mimeType === "text/plain") {

                if (part.body && part.body.data) {
                    return Buffer.from(
                        part.body.data,
                        "base64url"
                    ).toString("utf-8");
                }
            }


            if (part.parts) {

                const body = getBody(part);

                if (body !== "No text body found") {
                    return body;
                }
            }
        }
    }


    return "No text body found";
}

async function getImages(gmail: any, message: any) {

    if (!message.payload) {
        return;
    }


    const folder = path.resolve("attachments");


    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder);
    }


    async function checkParts(parts: any[]) {

        for (let i = 0; i < parts.length; i++) {

            const part = parts[i];

            if (!part) {
                continue;
            }


            if (part.mimeType && part.mimeType.startsWith("image/")) {

                let imageData = null;

                if (part.body && part.body.data) {

                    imageData = part.body.data;
                }

                else if (part.body && part.body.attachmentId) {

                    const attachment =
                        await gmail.users.messages.attachments.get({
                            userId: "me",
                            messageId: message.id,
                            id: part.body.attachmentId,
                        });


                    imageData = attachment.data.data;
                }


                if (imageData) {

                    let filename =
                        part.filename || "image-" + Date.now() + ".jpg";


                    filename = filename.replace(
                        /[^a-zA-Z0-9._-]/g,
                        "_"
                    );


                    const filePath =
                        path.join(folder, filename);


                    fs.writeFileSync(
                        filePath,
                        Buffer.from(
                            imageData,
                            "base64url"
                        )
                    );


                    console.log("Image found:", filename);
                    console.log("Saved to:", filePath);
                }
            }


            if (part.parts) {
                await checkParts(part.parts);
            }
        }
    }


    if (message.payload.parts) {
        await checkParts(message.payload.parts);
    }
}

async function showThread(gmail: any, threadId: string) {

    const thread = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
    });


    const threadMessages = thread.data.messages;


    if (!threadMessages) {
        console.log("No messages found in this thread.");
        return;
    }


    console.log("COMPLETE THREAD");



    console.log(
        "TOTAL MESSAGES: " + threadMessages.length
    );

    console.log();

    for (let i = 0; i < threadMessages.length; i++) {

        const message = threadMessages[i];

        if (!message) {
            continue;
        }


        let from = "";
        let to = "";
        let subject = "";
        let date = "";

        if (message.payload && message.payload.headers) {

            const headers = message.payload.headers;


            for (let j = 0; j < headers.length; j++) {

                const header = headers[j];

                if (!header) {
                    continue;
                }


                if (header.name === "From") {
                    from = header.value || "";
                }


                if (header.name === "To") {
                    to = header.value || "";
                }


                if (header.name === "Subject") {
                    subject = header.value || "";
                }


                if (header.name === "Date") {
                    date = header.value || "";
                }
            }
        }


        let body = "No text body found";


        if (message.payload) {
            body = getBody(message.payload);
        }

        console.log("Message " + (i + 1));

        console.log("Message ID:", message.id);
        console.log("Thread ID:", message.threadId);
        console.log("From:", from);
        console.log("To:", to);
        console.log("Subject:", subject);
        console.log("Date:", date);

        console.log("Body:");
        console.log(body);


        // Get images
        await getImages(
            gmail,
            message
        );

        console.log();
    }
}


async function main() {


    const auth = await authenticate({
        keyfilePath: path.resolve("credentials.json"),
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    });


    const gmail = google.gmail({
        version: "v1",
        auth: auth,
    });

    const processedMessages: string[] = [];

    const firstResponse = await gmail.users.messages.list({
        userId: "me",
        maxResults: 50,
    });

    const oldMessages = firstResponse.data.messages;


    if (oldMessages) {

        for (let i = 0; i < oldMessages.length; i++) {

            const message = oldMessages[i];

            if (!message) {
                continue;
            }


            if (message.id) {
                processedMessages.push(message.id);
            }
        }
    }

    console.log("      GMAIL MONITOR STARTED");
    console.log("\n");

    console.log("Waiting for new emails...\n");


    setInterval(async () => {

        try {

            console.log("Checking Gmail...");


            const response = await gmail.users.messages.list({
                userId: "me",
                maxResults: 50,
            });


            const messages = response.data.messages;


            if (!messages || messages.length === 0) {
                return;
            }

            for (let i = 0; i < messages.length; i++) {

                const message = messages[i];

                if (!message) {
                    continue;
                }


                const messageId = message.id;
                const threadId = message.threadId;


                if (!messageId || !threadId) {
                    continue;
                }

                if (processedMessages.includes(messageId)) {
                    continue;
                }

                console.log(" NEW EMAIL FOUND!");
                console.log("=================================\n");

                console.log("Message ID:", messageId);
                console.log("Thread ID:", threadId);


                processedMessages.push(messageId);


                await showThread(
                    gmail,
                    threadId
                );
            }

        } catch (error) {

            console.log("Error while checking Gmail:");
            console.log(error);
        }

    }, 10000);
}

main();