const express = require('express');
const app = express();
const http = require('http');
var cors = require("cors");
const server = http.createServer(app);
const { Server } = require("socket.io");
require('dotenv').config()

const fs = require('fs');

const redis = require('redis');

const crypto = require('crypto');

const { writeDatabase, readDatabase, connectDatabase, deleteDatabase } = require("./db-manager")

const { Client, Environment } = require('square');
const path = require('path');

// Square Client
const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production
});

// Socket Server
const io = new Server(server, {
    cors: {
        origin: '*',
    }
});

const reverbAPIUrl = "https://api.reverb.com/api/listings"

// async function createSquareLabel() {
//   // write me a function that makes a pdf file that has the item name, sku and price from square catelog item json array

//   const catalogObject = await squareClient.catalogApi.retrieveCatalogObject("Q2F0YWxvZ0JvYXJkOjEwMjU5NjU5NjU2MzY=");
//   const item = catalogObject.object.item_data;

//   const doc = new PDFDocument();




//   doc.pipe(fs.createWriteStream('output.pdf'));

//   doc.fontSize(25)
//     .text(`${item.name}`, 100, 100);
  
//   doc.fontSize(25)
//     .text(`SKU: ${item.variations[0].sku}`, 100, 200);
  
//   doc.fontSize(25)
//     .text(`Price: $${item.variations[0].price_money.amount / 100}`, 100, 300);

//   doc.end();

//   // save the document to a file
//   doc.pipe(fs.createWriteStream('output.pdf'));

//   return doc;
// }

// createSquareLabel()

function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFile('log.txt', logMessage, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
}

async function createReverbListing(item) {
  return new Promise((resolve, reject) => { 
    const url = reverbAPIUrl

    const data = {
      make: item.make,
      model: item.model,
      categories: [{
        "uuid": item.category
      }],
      condition: {
          "uuid": item.condition
      },
      photos: [],
      description: `${item.make} ${item.model}`,
      price: {
          amount: item.listPrice.includes(".") ? item.listPrice : item.listPrice + ".00",
          currency: "USD"
      },
      title: `(${item.sku}) ${item.make} ${item.model}`,
      sku: item.sku,
      upc_does_not_apply: "true",
      has_inventory: true,
      inventory: item.stock,
      offers_enabled: false,
      handmade: false,
  }

    const headers = {
      headers: {
        "content-type": "application/hal+json",
        "accept": "application/hal+json",
        "accept-version": "3.0",
        "authorization": "Bearer " + process.env.REVERB_ACCESS_TOKEN
      },
      body: JSON.stringify(data),
      method: "POST"
    }

    fetch(url, headers).then(data => { resolve(data.json()) }).catch(error => console.log(error));
  })
}

// write a function that gets all the catelog items using cursor from square and sorts by highest sku number and returns the highest sku number 
async function getHighestSku() {
  return new Promise(async (resolve, reject) => {
    try{
      let cursor = '';
      let hasMoreItems = true;
      let items = [];

      while (hasMoreItems) {
        try {
          const response = await squareClient.catalogApi.listCatalog(cursor);
          const { objects, cursor: nextCursor } = response.result;
          items = items.concat(objects);

          if (!nextCursor) {
            hasMoreItems = false;
          } else {
            cursor = nextCursor;
          }

        } catch (error) {
          logToFile('Error while fetching catalog items: ' + error);
        }
      }

      // Sort items by SKU  
      items.sort((a, b) => {
        if (a.type === "ITEM" && b.type === "ITEM") {

          const variationA = a.itemData.variations[0];

          const variationB = b.itemData.variations[0];

          if (variationA && variationB) {

            const skuA = variationA.sku ? variationA.sku.toUpperCase() : '';

            const skuB = variationB.sku ? variationB.sku.toUpperCase() : '';

            if (skuA < skuB) {

              return -1;

            }

            if (skuA > skuB) {

              return 1;

            }

          }
        }

        return 0;
      });

      const highestSku = items[items.length - 1].itemData.variations[0].itemVariationData.sku;

      if (isNaN(highestSku)) {
        logToFile('Highest SKU value is NaN: ' + highestSku);
        resolve(highestSku)
      } else {
        resolve(highestSku);
      }

    } catch (error) {
      logToFile('Error in getHighestSku: ' + error);
      reject(error)
    }
  })
}

async function createReverb(data) {
  return new Promise(async (resolve, reject) => {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      
      await createReverbListing(item)

      resolve()
    }
  })
}

// write a function to get tax objects from square
async function getTaxObjects() {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await squareClient.catalogApi.listCatalog(undefined, 'TAX');
      const { objects } = response.result;

      resolve(objects);
    } catch (error) {
      logToFile('Error in getTaxObjects: ' + error);
      reject(error);
    }
  })
}

getTaxObjects()

async function createSquareItem(data) {
  return new Promise(async (resolve, reject) => {

    var taxObjects = await getTaxObjects();
    var taxID = "";

    var squareIDs = [];

    await taxObjects.map((tax) => {
      if (tax.taxData.name.includes("Oklahoma")) {
        taxID = tax.id;
      }
    })

    await data.items.map(async (item, i) => {
      setTimeout(async () => {
        var make = item.make;
        var model = item.model;
        var included = item.included
    
        var price = item.listPrice;
    
        if (!price.includes(".")) {
          price = price + "00"
        }
        else {
          price = price.split(".")[0] + price.split(".")[1]
        }
    
        var stock = item.stock;
    
        var sku = item.sku;

        console.log('Tax ID: ' + taxID)
        logToFile('Tax ID: ' + taxID)

        try {
          const objectResponse = await squareClient.catalogApi.upsertCatalogObject({
            idempotencyKey: crypto.randomUUID(),
            object: {
              type: 'ITEM',
              id: '#create-item',
              itemData: {
                name: `(${sku}) ${make} ${model} ${included ? "w/" + included : ""}`,
                taxIds: [
                  taxID
                ],
                variations: [
                  {
                    type: 'ITEM_VARIATION',
                    id: '#create-item-varient',
                    itemVariationData: {
                      sku: sku.toString(),
                      pricingType: 'FIXED_PRICING',
                      priceMoney: {
                        amount: price,
                        currency: 'USD'
                      },
                      trackInventory: true
                    }
                  }
                ]
              }
            }
          });
    
          const stockResponse = await squareClient.inventoryApi.batchChangeInventory({
            idempotencyKey: crypto.randomUUID(),
            changes: [
              {
                type: 'PHYSICAL_COUNT',
                physicalCount: {
                  catalogObjectId: objectResponse.result.catalogObject.itemData.variations[0].id,
                  state: 'IN_STOCK',
                  locationId: objectResponse.result.catalogObject.itemData.variations[0].itemVariationData.locationOverrides[0].locationId,
                  quantity: stock.toString(),
                  occurredAt: new Date().toISOString()
                }
              }
            ]
          });

          console.log('Created Item: ' + objectResponse.result.catalogObject.id);
          logToFile('Created Item: ' + objectResponse.result.catalogObject.id);

          squareIDs.push(objectResponse.result.catalogObject.id);

          if (i === data.items.length - 1) {
            resolve(squareIDs);
          }
        } catch(error) {
          console.log(error);
          reject(error)
        }
      }, i * 1000)
    })
  })
}

app.use(cors())

app.use(express.static(path.join(__dirname, "database-front-end/build")))
app.use(express.static(path.join(__dirname, "barcodeFont")))

app.get('/barcodeFont.ttf', (req, res) => {
  res.sendFile(path.join(__dirname, "barcodeFont/free3of9.ttf"));
});

app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, "database-front-end/build/index.html"));
});

io.on('connection', async (socket) => {
  console.log('a user connected: ' + socket.id);

  socket.on("create-item", async (value) => {

    value = JSON.parse(value);

    await getHighestSku().then(async highestSku => {

      new_sku = parseInt(highestSku) + 1;

      // change sku in value.items array
      await value.items.map((item, i) => {
        value.items[i].sku = parseInt(new_sku.toString());
        new_sku++;
      })

      var squareIDs = await createSquareItem(value);

      console.log(squareIDs);

      await value.items.map((item, i) => {
        value.items[i].squareID = squareIDs[i];
      })

      console.log(value.toString() + " was created");

      await writeDatabase(JSON.stringify(value));

      io.to(socket.id).emit("created");

      io.emit("update", await readDatabase())
    }).catch(error => console.log("There was a error: " + error));
  })

  socket.on("set-complete", async (data) => {
    data.completed = !data.completed;

    await writeDatabase(JSON.stringify(data));

    socket.emit("data", await readDatabase())
    io.emit("update", await readDatabase())
  });

  socket.on("request-update", async (value) => {
    console.log("requested Update")

    const data = await readDatabase();
    io.to(socket.id).emit("update", data)
  });

  socket.on("get-data", async () => {
    const data = await readDatabase()
    socket.emit("data", data)
  })

  socket.on("create-reverb", async (data) => {
    await createReverb(data)

    data.reverbCreated = true;

    await writeDatabase(JSON.stringify(data));

    socket.emit("reverb")
    socket.emit("data", await readDatabase())
    io.emit("update", await readDatabase())
    console.log("Create Reverb")
  })

  socket.on("deleteItem", async (transactionID) => {

    await deleteDatabase(transactionID)

    socket.emit("delete-item", transactionID);
    io.emit("update", await readDatabase())
  })
});

server.listen(80, () => {
  console.log('listening on *:80');
  connectDatabase()
});