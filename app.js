const playwright = require('playwright-aws-lambda');
const aws = require("aws-sdk");
const { S3 } = require('aws-sdk');
const ses = new aws.SES({ region: "us-west-2"});
const s3 = new aws.S3({ region: "us-west-2"});

exports.handler = async (event) => {
    const browser = await playwright.launchChromium();
    const context = await browser.newContext();
    const page = await context.newPage();

    //Put your S3 Bucket's name here
    const bucket = "pixelcheckbucket";

    //Put your Pixelfile's filepath within your bucket here. 
    const key = "pixelfile.json"

    const pixelfile = await s3.getObject({
        Bucket: bucket,
        Key: key
    }).promise(); 

    const payload = JSON.parse(pixelfile.Body.toString());
    
    console.log("payload: " + JSON.stringify(payload));

    const sites = payload.sites;

    let results = [];
    let concerns = [];

    for(const site of sites) {

        const scanResult = new ScanResult(site.url);

        await page.goto(site.url);
        const pageContent = await page.content();

        if (pageContent) {

            await site.pixels.forEach(pixel => {
                const pixelResult = new PixelResult(pixel);

                if (pageContent.includes(pixel)) {
                    pixelResult.present = true;
                }
                else {
                    let concern = site.url + ": " + pixel;
                    concerns.push(concern);
                }

                scanResult.pixels.push(pixelResult);
            });
            
        }

        results.push(scanResult);
    }

    let message = "";
    const report = JSON.stringify(results);

    if(concerns.length > 0){
         message += "The following pixels could not be detected, please check manually: \n";
         message += "\n" + concerns + "\n";        
    }
    else{
        message += "All pixels verified.";
    }

    message += "\n Full report: \n \n" + report;

    await browser.close();    

    const email = {
        Destination: {
            //Put the email addresses you want to recieve the file here.
            ToAddresses: ["email@domain.tld", "email2@domain.tld"]            
        },
        Message: {
            Body: {
                Text: { Data: message }
            },
            Subject: {Data: "Pixel Check " + new Date() },            
        },
        //Put the email address you want the email to come from here. Use one your email client will trust.
        Source: "trustedemail@domain.tld"
    };

    return ses.sendEmail(email).promise();
};

class ScanResult {
    constructor(url){
        this.url = url;
        this.pixels = [];
    }
}

class PixelResult {
    constructor(pixelName) {
        this.pixelName = pixelName;
        this.present = false;
    }
}