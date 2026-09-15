import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({headless:true,...(executablePath && {executablePath})});
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const failures=[], errors=[];
 page.on('requestfailed',r => failures.push({url:r.url(),error:r.failure()?.errorText}));
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4174/',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('.train-card');
 await page.locator('#quickTrackInput').fill('12639');await page.locator('#quickTrackBtn').click();
 await page.waitForFunction(()=>state.selectedTrain?.number==='12639' && state.spots.length>0);
 await page.locator('#map').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelectorAll('.leaflet-tile-loaded').length>0,{},{timeout:15000}).catch(()=>{});
 await page.screenshot({path:'test-results/map-viewport.png'});
 await page.locator('#spotGrid').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>[...document.querySelectorAll('.spot-card img')].some(i=>i.complete&&i.naturalWidth>0),{},{timeout:15000}).catch(()=>{});
 await page.screenshot({path:'test-results/tourism-viewport.png'});
 const report=await page.evaluate(()=>({train:state.selectedTrain.number,routeStops:state.selectedTrain.route.length,mapMarkers:state.routeLayer.getLayers().length,loadedTiles:document.querySelectorAll('.leaflet-tile-loaded').length,photosLoaded:[...document.querySelectorAll('.spot-card img')].filter(i=>i.complete&&i.naturalWidth>0).length,photoCards:state.spots.length}));
 await page.setViewportSize({width:390,height:844});await page.locator('.spot-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/tourism-mobile-viewport.png'});
 writeFileSync('test-results/external-assets-report.json',JSON.stringify({report,failures,errors},null,2));
 console.log(JSON.stringify({report,failedRequests:failures.length,errors}));
} finally {await browser.close();}
