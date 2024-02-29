const { PKPass } = require("passkit-generator");

const admin = require("firebase-admin");
const axios = require("axios");
const functions = require("firebase-functions");
const serviceAccount = require('./serviceAccount/service-account-key.json');

const express = require("express");

const fs = require("fs");

// init
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  apiKey: "AIzaSyDQrW3lWmgdgrB-Oxs7GMOycKVGZScfuWk",
  authDomain: "pass2wallet.firebaseapp.com",
  projectId: "pass2wallet",
  storageBucket: "pass2wallet.appspot.com",
  messagingSenderId: "104163586896",
  appId: "1:104163586896:web:6020e325bf57c61977f255",
});

const app = express();
const storageRef = admin.storage().bucket();
const firestoreRef = admin.firestore().collection("passes");

function hexToRgb(hex) {
  // Remove # if it exists
  hex = hex.replace("#", "");

  // Parse hex to RGB
  let bigint = parseInt(hex, 16);
  let r = (bigint >> 16) & 255;
  let g = (bigint >> 8) & 255;
  let b = bigint & 255;

  let rgbString = `rgb(${r}, ${g}, ${b})`;

  return rgbString;
}

app.get("/pass/:serialNumber", async (request, response) => {
  const serialNumber = request.params.serialNumber
  console.log(serialNumber);

  var name;
  var email;
  var count;
  var thumbnail_url;

  firestoreRef
    .doc(serialNumber)
    .get()
    .then((doc) => {
      if (doc.exists) {
        const data = doc.data();
        name = data["name"];
        email = data["email"];
        count = data["count"] + 1;
        thumbnail_url = data["thumbnail_url"];
      } else if (request.body != null) {
        name = request.body.primary.value;
        email = serialNumber;
        count = 1;
        thumbnail_url = request.body.thumbnail;
      } else {
        console.error("Error generating download URL:", error);
        response.status(400).send("Object not found");
      }

      PKPass.from(
        {
          model: "./model/custom.pass",
          certificates: {
            wwdr: fs.readFileSync("./certs/wwdr.pem"),
            signerCert: fs.readFileSync("./certs/signerCert.pem"),
            signerKey: fs.readFileSync("./certs/signerKey.pem"),
            signerKeyPassphrase: "test",
          },
        },
        {
          authenticationToken: "21973y18723y12897g31289yge981y2gd89ygasdqsqdwq",
          webServiceURL:
            "https://us-central1-nawaf-codes.cloudfunctions.net/pass",
          serialNumber: serialNumber,
          description: "test description pass",
          logoText: "logoText description",
          foregroundColor: hexToRgb("#000000"),
          backgroundColor: hexToRgb("#FFFFFF"),
        }
      ).then(async (newPass) => {
        newPass.primaryFields.push({
          key: "primary",
          label: "name",
          value: name,
        });
        newPass.secondaryFields.push(
          {
            key: "secondary0",
            label: "email",
            value: email,
          },
          {
            key: "secondary1",
            label: "count",
            value: count,
          }
        );
        newPass.auxiliaryFields.push(
          {
            key: "auxiliary0",
            label: "aux0",
            value: "",
          },
          {
            key: "auxiliary1",
            label: "aux1",
            value: "",
          }
        );
        newPass.backFields.push();
        newPass.setBarcodes("234567432");
        fileExtension = "pkpass";

        const thumbnail = await axios.get(thumbnail_url, {
          responseType: "arraybuffer",
        });

        const buffer = Buffer.from(thumbnail.data, "utf-8");
        newPass.addBuffer("thumbnail.png", buffer);
        newPass.addBuffer("thumbnail@2x.png", buffer);
        const bufferData = newPass.getAsBuffer();

        // fs.writeFileSync("new.pkpass", bufferData);

        firestoreRef.doc(serialNumber).set({
          name: name,
          email: email,
          count: count,
          thumbnail_url: thumbnail_url,
          foregroud_color: "#000000",
          background_color: "#FFFFFF",
        });

        storageRef
          .file(`passes/${serialNumber}.pkpass`)
          .save(bufferData, (error) => {
            if (!error) {
              console.log("Pass uploaded with success.");
            } else {
              console.log(error);
            }
          })
          .then(() => {
            storageRef
              .file(`passes/${serialNumber}.pkpass`)
              .getSignedUrl({
                action: "read",
                expires: "03-01-2500", // Expires in the year 2500, adjust as needed
              })
              .then(async (signedUrls) => {
                const downloadUrl = signedUrls[0];
                const pass = await axios.get(downloadUrl, {
                  responseType: "arraybuffer",
                });

                response.setHeader(
                  "Content-Disposition",
                  `attachment; filename="${serialNumber}.pkpass"`
                );
                response.status(200).send(pass.data);
              })
              .catch((error) => {
                console.error("Error generating download URL:", error);
                response.status(500).send("Error generating download URL");
              });
          });
      });
    });
});

exports.app = functions.https.onRequest(app);
