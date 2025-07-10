const { TIMEOUT } = require('dns');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false,ignoreHTTPSErrors: true });
  const page = await browser.newPage();
  await page.goto('https://blackdragon.mobi/');
  //Load collectible list
  var fs = require('fs');
  var text = fs.readFileSync("./collectibles.txt", 'utf-8');
  var collectibles = text.split('\n');
  // Make sure we got a filename on the command line.
if (process.argv.length < 3) {
  console.log('Usage: node ' + process.argv[1] + ' FILENAME');
  process.exit(1);
}
// Read the file and print its contents.
const ini = require('ini');
const credentials = {
  user: {
      username: 'myUsername',
      password: 'myPassword'
  }
};
var fs = require('fs')
  , filename = process.argv[2];
  const  data = fs.readFileSync(filename, 'utf-8');
  const  config = ini.parse(data);

  await page.focus('input[name=username]');
  await page.keyboard.type(config.user.username);
  await page.focus('input[name=password]');
  await page.keyboard.type(config.user.password);
    // Click the login button and wait for navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }), // Ensures the next page is loaded
      page.click('.button')
  ]);
// Done Login
await page.waitForSelector("body > div.list.center.small > a:nth-child(6)");
await page.click("body > div.list.center.small > a:nth-child(6)");

await page.waitForSelector("body > div.main > div.block > table > tbody > tr:nth-child(27) > td:nth-child(2) > a");
await page.click("body > div.main > div.block > table > tbody > tr:nth-child(27) > td:nth-child(2) > a");
do{


await page.waitForSelector("body > div.main > div.block > form > p > input");
await page.click("body > div.main > div.block > form > p > input");

await page.waitForNavigation();
await page.waitForSelector("body > div.main > div.block > form > p > input.button");
await page.click("body > div.main > div.block > form > p > input.button");


await page.waitForNavigation();
await page.waitForSelector("body > div.main > div.nav > a:nth-child(1)");
await page.click("body > div.main > div.nav > a:nth-child(1)");
}while(true);
async function nextAttack(){   
  await page.waitForNavigation();
  await page.waitForSelector('body > div.main > strong');
  let element = await page.$('body > div.main > strong');
  let text = await page.evaluate(el => el.textContent, element);
  let clipText = text.substr(0, 27) ;
  if(text=='Congratulations! You won the battle!'||text=='You lost the battle.'){
    
    await page.waitForSelector("body > div.main > form > input");
    await page.click("body > div.main > form > input", {timeout: 100});
    await nextAttack();
  }else if(clipText=="Congratulations! You KILLED"){
    // If kill the monster
    const nameFull ="";
    try {
      await page.waitForSelector("body > div.main > a", { timeout: 100 });
      nameFull =  await page.$eval('body > div.main > a', el => el.innerText);
  } catch (error) {
  }  

    const nameClip = nameFull.substr(0, 5) ;
    if(nameClip == "Rune "||nameFull.toLowerCase().includes("magic scroll") || nameFull == ""){
      const isGet = true;
    }else{
      const isGet = false;
    }
    if(true){

          await page.waitForSelector('body > div.main > form:nth-child(3) > input');
          await page.click("body > div.main > form:nth-child(3) > input");
        

      await console.log(nameFull); // test
      choosing();
    }else{
      try{          
      await page.waitForSelector("body > div.main > form:nth-child(17) > input", {timeout:100});
      await page.waitForSelector('body > div.main > form:nth-child(17) > input');
      await page.click("body > div.main > form:nth-child(17) > input");
      choosing();
    }
      catch{

        try{        
          await page.waitForSelector("body > div.main > form:nth-child(15) > input", {timeout:100});
          await page.waitForSelector('body > div.main > form:nth-child(15) > input');
          await page.click("body > div.main > form:nth-child(15) > input");
          choosing();}
          catch{
            try {
              await page.waitForSelector("body > div.main > form:nth-child(13) > input", {timeout:100});
              await page.waitForSelector('body > div.main > form:nth-child(13) > input');
              await page.click("body > div.main > form:nth-child(13) > input");
              choosing();
            }
              catch{
                
              await page.waitForSelector("body > div.main > form:nth-child(11) > input", {timeout:100});
            await page.waitForSelector('body > div.main > form:nth-child(11) > input');
            await page.click("body > div.main > form:nth-child(11) > input");}
            choosing();
          }}
      }
  }
}

async function firstAttack(){
  try{
    await page.waitForSelector("body > div.main > form > input", {timeout: 200});
    await page.click("body > div.main > form > input");
    await nextAttack();
  }
  catch{
    try{
      await page.waitForSelector("body > div.main > div.list.small > form > input", {timeout: 500});
      await page.click("body > div.main > div.list.small > form > input");
      await firstAttack();
    }catch{
      await nextAttack();
    }

  }
}


async function choosing(){
  
  await page.waitForSelector(".unit.round");
  await page.click(".unit.round");
  
  firstAttack();
}
  choosing();
})();