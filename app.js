const line = require('@line/bot-sdk');
const express = require('express');
const mqtt = require('mqtt');
const ngrok = require('ngrok');
const firebase = require('firebase');

const port = process.env.PORT || 3000;
require('dotenv').config()

//Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDnTuQm2i90WOm7Mt2wNYLisBkEr2ouLbY",
    authDomain: "cn466-32820.firebaseapp.com",
    projectId: "cn466-32820",
    storageBucket: "cn466-32820.appspot.com",
    messagingSenderId: "534068816505",
    appId: "1:534068816505:web:68f9e78b24b61e6d9882a8",
    measurementId: "G-L1PF5JMYVV"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
function add(nameCollection, data) {
    db.collection(nameCollection).add(data)
        .then((docRef) => {
            console.log("Document written with ID: ", docRef.id);
        })
        .catch((error) => {
            console.error("Error adding document: ", error);
        });
}
function getdata(nameCollection) {
    return db.collection(nameCollection).get();

}

function removeProduct(name) {
    const data = getdata("Products");
    data.then(snapshot => {
        snapshot.forEach(doc => {
            if (doc.data().productName == name) {
                console.log(doc.id);
                db.collection("Products").doc(doc.id).delete().then(() => {
                    console.log("Document successfully deleted!");
                }).catch((error) => {
                    console.error("Error removing document: ", error);
                });
            }
        })

    })
}

let currentData = {};
let products = [];

var mqttClient = mqtt.connect(process.env.HIVEMQ_BROKER);
mqttClient.on('connect', () => {
    console.log('HIVEMQ connected');
    mqttClient.subscribe([process.env.SENSOR_TOPIC], () => {
        console.log("Topic subscribed");
    });
});
//line-bot
const lineConfig = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
};

const lineClient = new line.Client(lineConfig);
const app = express();
let time = 0;
//mqttClient.on('follo')
mqttClient.on('message', (topic, payload) => {
    console.log('Received Message:', topic, payload.toString())
    currentData = JSON.parse(payload.toString());
    if (time == 3){
        notify(currentData.temperature ,currentData.humidity)
    }
    time = (time + 1)%4;

});


app.post('/callback', line.middleware(lineConfig), (req, res) => {
    if (req.body.destination) {
        console.log("Destination User ID: " + req.body.destination);
    }

    // req.body.events should be an array of events
    if (!Array.isArray(req.body.events)) {
        return res.status(500).end();
    }

    // handle events separately 
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

function handleEvent(event) {
    console.log('Got event ' + event);
    if (event.type !== 'message' || event.message.type !== 'text') {
        // ignore non-text-message event
        return Promise.resolve(null);
    }
    // create a echoing text message
    console.log(event.message.text);
    const text = event.message.text.split(" ");

    //แสดงอุณหภูมิและความชื้น
    if (event.message.text == "อุณหภูมิ") {
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: "อุณหภูมิปัจจุบัน: " + currentData.temperature });
    }
    else if (event.message.text == "ความชื้น") {
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: "ความชื้นปัจจุบัน: " + currentData.humidity });
    }
    else if (event.message.text == "อุณหภูมิที่เหมาะสม") {
        const users = getdata("Temperature");
        users.then((snapshot) => {
            let lasttemp;
            snapshot.forEach(doc => {
                lasttemp = doc.data();
            });
            console.log(lasttemp);
            lineClient.replyMessage(event.replyToken, { type: 'text', text: "อุณหภูมิที่เหมาะสม max " + String(lasttemp.maxTemperature) + " min " + String(lasttemp.minTemperature) });
        });
        return null;
    }
    else if (event.message.text == "ความชื้นที่เหมาะสม") {
        const users = getdata("Humidity");
        users.then((snapshot) => {
            let lastHumi;
            snapshot.forEach(doc => {
                lastHumi = doc.data();
            });
            console.log(lastHumi);
            lineClient.replyMessage(event.replyToken, { type: 'text', text: "ความชื้นที่เหมาะสม max " + String(lastHumi.maxHumidity) + " min " + String(lastHumi.minHumidity) });
        });
        return null;
    }

    //แก้อุณหภูมิ    
    else if ((text[0] == "แก้ไขอุณหภูมิที่เหมาะสม") && (text[1] == "max") && (text[3] == "min")) {
        const users = getdata("Users");
        users.then(async (snapshot) => {
            let isowner = 0;
            await snapshot.forEach(doc => {
                if (doc.data().userID == event.source.userId && doc.data().status == "owner") {
                    isowner = true;
                    if (isNaN(parseFloat(text[2])) || isNaN(parseFloat(text[4]))) {
                        isowner = 2;

                    } else {
                        isowner = 1;
                    }
                }
            });
            if (isowner == 1) {
                db.collection("Temperature").add({ "maxTemperature": parseFloat(text[2]), "minTemperature": parseFloat(text[4]) })
                    .then((docRef) => {
                        console.log("Document written with ID: ", docRef.id);
                        const data = getdata("Temperature");
                        data.then(snapshot => {
                            snapshot.forEach(doc => {
                                if (docRef.id != doc.id) {
                                    db.collection("Temperature").doc(doc.id).delete().then(() => {
                                        console.log("Document successfully deleted!");
                                    }).catch((error) => {
                                        console.error("Error removing document: ", error);
                                    });
                                }

                            })

                        })
                    })
                    .catch((error) => {
                        console.error("Error adding document: ", error);
                    });

                await lineClient.replyMessage(event.replyToken, { type: 'text', text: "แก้ไขอุณหภูมิเสร็จสิ้น" });
            }
            else if (isowner == 0) {
                lineClient.replyMessage(event.replyToken, { type: 'text', text: "คุณไม่ใช่เจ้าของ" });
            }
            else if (isowner == 2) {
                lineClient.replyMessage(event.replyToken, { type: 'text', text: "รูปแบบข้อมูลไม่ถูกต้อง กรุณาพิมพ์ใหม่อีกครั้ง" });
            }
        });


        return null;
    }

    //แก้ความชื้น
    else if ((text[0] == "แก้ไขความชื้นที่เหมาะสม") && (text[1] == "max") && (text[3] == "min")) {
        const users = getdata("Users");
        users.then(async (snapshot) => {
            let isowner = 0;
            await snapshot.forEach(doc => {
                if (doc.data().userID == event.source.userId && doc.data().status == "owner") {
                    isowner = true;
                    if (isNaN(parseFloat(text[2])) || isNaN(parseFloat(text[4]))) {
                        isowner = 2;

                    } else {
                        isowner = 1;
                    }
                }
            });
            if (isowner == 1) {
                db.collection("Humidity").add({ "maxHumidity": parseFloat(text[2]), "minHumidity": parseFloat(text[4]) })
                    .then((docRef) => {
                        console.log("Document written with ID: ", docRef.id);
                        const data = getdata("Humidity");
                        data.then(snapshot => {
                            snapshot.forEach(doc => {
                                if (docRef.id != doc.id) {
                                    db.collection("Humidity").doc(doc.id).delete().then(() => {
                                        console.log("Document successfully deleted!");
                                    }).catch((error) => {
                                        console.error("Error removing document: ", error);
                                    });
                                }

                            })

                        })
                    })
                    .catch((error) => {
                        console.error("Error adding document: ", error);
                    });

                await lineClient.replyMessage(event.replyToken, { type: 'text', text: "แก้ไขความชื้นเสร็จสิ้น" });
            }
            else if (isowner == 0) {
                lineClient.replyMessage(event.replyToken, { type: 'text', text: "คุณไม่ใช่เจ้าของ" });
            }
            else if (isowner == 2) {
                lineClient.replyMessage(event.replyToken, { type: 'text', text: "รูปแบบข้อมูลไม่ถูกต้อง กรุณาพิมพ์ใหม่อีกครั้ง" });
            }
        });


        return null;
    }

    //ฟังชั่นที่ใช้งาน
    else if (event.message.text == "function") {
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: "Function\nถามอุณหภูมิ : อุณหภูมิ\nถามความชื้น : ความชื้น\nถามอุณหภูมิที่เหมาะสม : อุณหภูมิที่เหมาะสม\nถามความชื้นที่เหมาะสม : ความชื้นที่เหมาะสม\nแก้ไขอุณหภูมิที่เหมาะสมในหน่วยองศาเซลเซียส(เฉพาะเจ้าของ) : แก้ไขอุณหภูมิที่เหมาะสม max <ค่าอุณหภูมิสูงสุด> min <ค่าอุณหภูมิต่ำสุด>\nแก้ไขความชื้นที่เหมาะสม(เฉพาะเจ้าของ) : แก้ไขความชื้นที่เหมาะสม max <ค่าความชื้นสูงสุด> min <ค่าความชื้นต่ำสุด>\nถามข้อมูลสิ้นค้า : ข้อมูลสินค้า\nเพิ่มข้อมูลสินค้า : เพิ่มสินค้า <ชื่อสินค้า> <จำนวนสินค้า>\n ลบข้อมูลสินค้า : ลบสินค้า <ชื่อสินค้า>" });
    }

    //สถานะผู้ใช้
    else if (event.message.text == "เจ้าของ") {
        add("Users", { "userID": event.source.userId, "status": "owner" })
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: "คุณเป็นเจ้าของเเล้ว" });
    }
    else if (event.message.text == "พนักงาน") {
        add("Users", { "userID": event.source.userId, "status": "employee" })
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: "คุณเป็นพนักงานเเล้ว" });
    }

    //สินค้า
    else if (event.message.text == "ข้อมูลสินค้า") {

        const products = getdata("Products");
        products.then((snapshot) => {
            let Products = [];
            let allProductAmount = 0;
            snapshot.forEach(doc => {
                Products.push({ type: 'text', text: "ชื่อสินค้า: " + doc.data().productName + "\nจำนวนสินค้า: " + doc.data().productAmount })
                console.log(doc.data());
                allProductAmount = allProductAmount + doc.data().productAmount;

            });
            Products.push({ type: 'text', text: "จำนวนสินค้าทั้งหมด: " + allProductAmount })
            lineClient.replyMessage(event.replyToken, Products);
        });
        return null;
    }
    else if (text[0] == "เพิ่มสินค้า") {
        if (isNaN(parseFloat(text[2]))) {
            return lineClient.replyMessage(event.replyToken, { type: 'text', text: "รูปแบบข้อมูลไม่ถูกต้อง กรุณาพิมพ์ใหม่อีกครั้ง" });
        } else {
            add("Products", { "productName": text[1], "productAmount": parseFloat(text[2]) })
        }
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: "เพิ่มสินค้าเสร็จสิ้น" });
    }
    else if (text[0] == "ลบสินค้า") {
        let nameproduct = text[1];
        removeProduct(nameproduct);
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: "ลบสินค้าเสร็จสิ้น" });
    }

    const echo = [
        { type: 'text', text: "hello" + event.source.userId },
        { type: 'text', text: event.message.text }
    ];

    // use reply API
    return lineClient.replyMessage(event.replyToken, echo);
}

function notify(temp ,humi) {
    const Temp = getdata("Temperature");
    const Humi = getdata("Humidity");
    Temp.then((snapshot) => {
        let maxTemp;
        let minTemp;
        snapshot.forEach(doc => {
            maxTemp = doc.data().maxTemperature;
            minTemp = doc.data().minTemperature;
        });
        console.log("temp "+temp +" maxtemp " + maxTemp);
            if (temp > maxTemp) {
                lineClient.broadcast({ type: 'text', text: "อุณหภูมิสูงกว่าที่ควร\nอุณหภูมิปัจจุบัน: " + temp + " องศาเซลเซียส\nอุณหภูมิที่เหมาะสม: max " + maxTemp + " min " + minTemp + " องศาเซลเซียส"});
            }
            else if (temp < minTemp) {
                lineClient.broadcast({ type: 'text', text: "อุณหภูมิต่ำกว่าที่ควร\nอุณหภูมิปัจจุบัน: " + temp + " องศาเซลเซียส\nอุณหภูมิที่เหมาะสม: max " + maxTemp + " min " + minTemp + " องศาเซลเซียส"});
                //lineClient.replyMessage(event.replyToken, { type: 'text', text: "อุณหภูมิต่ำกว่าที่ควร\nอุณหภูมิปัจจุบัน: " + temp + " องศาเซลเซียส\nอุณหภูมิที่เหมาะสม: max " + maxTemp + " min " + minTemp + " องศาเซลเซียส"});
            }
    });
    Humi.then((snapshot) => {
        let maxHumi;
        let minHumi;
        snapshot.forEach(doc => {
            maxHumi = doc.data().maxHumidity;
            minHumi = doc.data().minHumidity;
        });
        console.log("humi "+humi +" maxhumi " +maxHumi);
            if (humi > maxHumi ) {
                console.log("5555555");
                lineClient.broadcast({ type: 'text', text: "ความชื้นสูงกว่าที่ควร\nความชื้นปัจจุบัน: " + humi + " %\nความชื้นที่เหมาะสม: max " + maxHumi + " min " + minHumi + " %"});
            }
            else if (humi < minHumi) {
                lineClient.broadcast({ type: 'text', text: "ความชื้นต่ำกว่าที่ควร\nความชื้นปัจจุบัน: " + humi + " %\nความชื้นที่เหมาะสม: max " + maxHumi + " min " + minHumi + " %"});
            }
    });
    
}

async function initServices() {
    const baseURL = process.env.BASE_URL;
    console.log('Set LINE webhook at ' + baseURL + '/callback');
    await lineClient.setWebhookEndpointUrl(baseURL + '/callback');
}

initServices();
app.listen(port, () => {
    console.log(`listening on ${port}`);
});