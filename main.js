//https://github.com/ongzzzzzz/p5.web-serial

let sizeCanvas = 200;
let sizeReal = 50;
let lineInterval = 5;
let mag = sizeCanvas / sizeReal;
let drawFileInput, setFileInput;
let test1Data, test2Data, mainData;
let test1Schedule = [], test2Schedule = [], mainSchedule = [], schedule = [];
let cuttingData = [];//描画用
let eps = 1e-6;
let cntSend = 0, cntReceive = 0;
let sendTextBox, recieveTextBox;
let sendData = [], recieveData = [];
let idxSchedule = 0;
let saveSendBtn, saveReceiveBtn;
let reset, angleBox;
let waitRecieve = false;
let orderNo = 0;
let test1Finished = false, test2Finished = false;
let drawErrorMessage = "", setErrorMessage = "";

//スライダー
let slider;

//ボタン
let upBtn, downBtn, leftBtn, rightBtn;
let cwBtn, ccwBtn;
let knifeUpBtn, knifeMidBtn, knifeDownBtn;
let holderUpBtn, holderDownBtn;
let setXYBtn, setTBtn, setKBtn, originBtn;
let setEnterBtn, calibrateEnterBtn;
let test1Btn, test2Btn, mainBtn;

//入力ボックス
let holderUpBox, holderDownBox;
let knifeUpBox, knifeMidBox, knifeDownBox;
let test1TopBox, test1RightBox, test2TopBox, test2RightBox;
let speedBox;


//--- class 開始------------------------------------------------------------------
const State = {
    waitInput : "waitInput",
    calibrate : "calibrate",
    run : "run", 
};

const OrderType = {
    none : "NONE",
    up : "UP",
    right : "RIGHT",
    cw : "CW",
    x : "X",
    y : "Y",
    theta : "T",
    hold : "HOLD",
    knife : "KNIFE",
    setXY : "SETXY",
    setTheta : "SETT",
    setKnife : "SETK",
    get : "GET",
}

class Order{
    constructor(type, val = 0, lineNo = -1){
        this.type = type;
        this.val = val;
        this.lineNo = lineNo;
        this.no = -1;//arduinoが命令を実行し終わったときに返す値、返信不要の場合は-1
    }

    toString(){
        var newVal = this.val;
        if(this.type == OrderType.knife){
            if(this.val == 0) newVal = parseInt(knifeDownBox.value());
            else if(this.val == 1) newVal = parseInt(knifeMidBox.value());
            else if(this.val == 2) newVal = parseInt(knifeUpBox.value());
        }else if(this.type == OrderType.hold){
            if(this.val == 0) newVal = parseInt(holderDownBox.value());
            else if(this.val == 1) newVal = parseInt(holderUpBox.value());
        }
        return this.type + " " + roundString(newVal) + " " + roundString(this.no);
    }

    copy(){
        let result = new Order(this.type);
        result.val = this.val;
        result.lineNo = this.lineNo;
        this.no = -1;
        return result;
    }
};

let state = State.waitInput;
let setXYFinished = false;
let setTFinished = false;
let showSendStart = 0, showRecieveStart = 0;
let preOrder = new Order(OrderType.none);
let shiftX = 2.0;
let shiftY = 2.0;

class Line{
    constructor(x1, y1, x2, y2, lineNo){
        this.startX = x1;
        this.startY = y1;
        this.endX = x2;
        this.endY = y2;
        this.theta = atan2(y2 - y1, x2 - x1);
        this.lineNo = lineNo;
        if(this.theta < 0){
            [this.startX, this.startY, this.endX, this.endY] = [this.endX, this.endY, this.startX, this.startY];
            this.theta = atan2(this.endY - this.startY, this.endX - this.startX);
        }
        if(this.theta > PI / 2){
            [this.startX, this.startY, this.endX, this.endY] = [this.endX, this.endY, this.startX, this.startY];
            this.theta = atan2(this.endY - this.startY, this.endX - this.startX);
        }
        this.machineX = 0;//台座を右に動かす時を正
        this.machineY1 = 0;//カッターナイフを上に動かす時を正
        this.machineY2 = 0;
        this.machineT = 0;//土台を反時計回りに回す時を正
        this.updateMachineState();
    }

    visualize(){
        line(this.startX * mag, -this.startY * mag, 
            this.endX * mag, -this.endY * mag);
    }

    updateMachineState(){
        this.machineT = PI / 2 - this.theta;
        while(this.machineT > PI) this.machineT -= 2 * PI;
        while(this.machineT < -PI) this.machineT += 2 * PI;
        let start = rotPoint(this.startX, this.startY, this.machineT);
        let end = rotPoint(this.endX, this.endY, this.machineT);
        this.machineX = start[0];
        this.machineY1 = start[1];
        this.machineY2 = end[1];
        if(this.machineY1 < this.machineY2){
            [this.machineY1, this.machineY2] = [this.machineY2, this.machineY1];
        }
    }

    addSchedule(data){
        append(data, new Order(OrderType.x, round(this.machineX * 1000) / 1000 + 3));
        append(data, new Order(OrderType.x, round(this.machineX * 1000) / 1000));
        append(data, new Order(OrderType.y, round(this.machineY1 * 1000) / 1000 + 3));
        append(data, new Order(OrderType.y, round(this.machineY1 * 1000) / 1000));
        append(data, new Order(OrderType.theta, round(this.machineT * 1000) / 1000));
        append(data, new Order(OrderType.hold, 0));
        append(data, new Order(OrderType.knife, 0));
        append(data, new Order(OrderType.y, round(this.machineY2 * 1000) / 1000));
        append(data, new Order(OrderType.knife, 1));
        append(data, new Order(OrderType.hold, 1));
    }
};

//--- class 終了------------------------------------------------------------------
//--- setup draw 開始------------------------------------------------------------------

let port, reader, writer;

function preload(){
    test1Data = loadStrings("test1Input.txt");//preloadで呼び出す
    test2Data = loadStrings("test2Input.txt");
    mainData = loadStrings("mainInput.txt");
}

async function setup() {
    test1Schedule = cuttingFileSchedule(test1Data);//setupで呼び出す
    test2Schedule = cuttingFileSchedule(test2Data);
    mainSchedule = cuttingFileSchedule(mainData, true);
    print("test1", test1Schedule);
    print("test2", test2Schedule);
    print("main", mainSchedule);
	let cnv = createCanvas(windowWidth, windowHeight);
    fileInput = createFileInput(fileInputed).position(10, 10);
    sendTextBox = createInput("").position(50, 456).size(90);
    recieveTextBox = createInput("").position(200, 456).size(150);
    saveSendBtn = createButton("save").position(10, 605);
    saveSendBtn.mousePressed(() => {
        save(schedule, "sendData", "txt");
    });
    saveReceiveBtn = createButton("save").position(150, 605);
    saveReceiveBtn.mousePressed(() => {
        save(recieveData, "recieveData", "txt");
    });
    slider = createSlider(0, cuttingData.length).value(0).position(0, 410).size(350);
    cnv.mouseWheel(wheelMoved);
    upBtn = createButton("↑").size(25, 25).mousePressed(upBtnPressed).mouseReleased(keyReleased);
    leftBtn = createButton("←").size(25, 25).mousePressed(leftBtnPressed).mouseReleased(keyReleased);
    rightBtn = createButton("→").size(25, 25).mousePressed(rightBtnPressed).mouseReleased(keyReleased);
    downBtn = createButton("↓").size(25, 25).mousePressed(downBtnPressed).mouseReleased(keyReleased);
    cwBtn = createButton("↷").size(25, 25).mousePressed(cwBtnPressed).mouseReleased(keyReleased);
    ccwBtn = createButton("↶").size(25, 25).mousePressed(ccwBtnPressed).mouseReleased(keyReleased);
    knifeDownBtn = createButton("down").size(45, 20).mousePressed(knifeDownBtnPressed).mouseReleased(keyReleased);
    knifeMidBtn = createButton("mid").size(45, 20).mousePressed(knifeMidBtnPressed).mouseReleased(keyReleased);
    knifeUpBtn = createButton("up").size(45, 20).mousePressed(knifeUpBtnPressed).mouseReleased(keyReleased);
    setXYBtn = createButton("xy").size(45, 20).mousePressed(setXYBtnPressed).mouseReleased(keyReleased);
    setTBtn = createButton("θ").size(45, 20).mousePressed(setTBtnPressed).mouseReleased(keyReleased);
    originBtn = createButton("origin").size(45, 20).mousePressed(originBtnPressed);
    test1Btn = createButton("test1").size(45, 20).mousePressed(test1BtnPressed).mouseReleased(keyReleased).style("color", color(180));
    test2Btn = createButton("test2").size(45, 20).mousePressed(test2BtnPressed).mouseReleased(keyReleased).style("color", color(180));
    mainBtn = createButton("main").size(45, 20).mousePressed(mainBtnPressed).mouseReleased(keyReleased).style("color", color(180));
    saveSetBtn = createButton("save").size(45, 25).mousePressed(saveSetBtnPressed);
    setFInput = createFileInput(setFileInputed);
    holderDownBox = createInput("85", "Number").size(60, 20).mousePressed(boxMousePressed);
    holderUpBox = createInput("110", "Number").size(60, 20).mousePressed(boxMousePressed);
    knifeDownBox = createInput("148", "Number").size(60, 20).mousePressed(boxMousePressed);
    knifeMidBox = createInput("136", "Number").size(60, 20).mousePressed(boxMousePressed);
    knifeUpBox = createInput("100", "Number").size(60, 20).mousePressed(boxMousePressed);
    speedBox = createInput("3", "Number").size(60, 20).mousePressed(boxMousePressed);
    calibrateEnterBtn = createButton("ok").size(45, 20).mousePressed(calibrateEnterBtnPressed).mouseReleased(keyReleased);
    test1TopBox = createInput("2.0", "Number").size(60, 20).changed(calibrateChanged1).mousePressed(boxMousePressed);
    test1RightBox = createInput("2.0", "Number").size(60, 20).changed(calibrateChanged1).mousePressed(boxMousePressed);
    test2TopBox = createInput("0.0", "Number").size(60, 20).changed(calibrateChanged2).mousePressed(boxMousePressed);
    test2RightBox = createInput("0.0", "Number").size(60, 20).changed(calibrateChanged2).mousePressed(boxMousePressed);
    holderUpBtn = createButton("up").size(45, 20).mousePressed(holderUpBtnPressed);
    holderDownBtn = createButton("down").size(45, 20).mousePressed(holderDownBtnPressed);
    keyAvailableChbox = createCheckbox("", true);
    windowResized();
	save({ port, reader, writer } = await getPort());
	loop();
}

async function draw() {
    background(220);
    if(slider) drawMachineState(slider.value() - 1);
    setXYBtn.style("color", color(setXYFinished ? 0 : 255, 0, 0));
    setTBtn.style("color", color(setTFinished ? 0 : 255, 0, 0));
    calibrateEnterBtn.style("color", color((test1TopBox.value() == "2.0" && test1RightBox.value() == "2.0") ? 0 : 255, 0, 0));
    if(runAvalilable()){
        test1Btn.style("color", color(0));
        test2Btn.style("color", color(0));
        mainBtn.style("color", color(0));
    }else{
        test1Btn.style("color", color(180));
        test2Btn.style("color", color(180));
        mainBtn.style("color", color(180));
    }
    stroke(200);
    line(380, 0, 380, 700);
    line(580, 0, 580, 480);
    line(380, 480, 900, 480);
    noStroke();
    if(slider) text((slider.value()) + "/" + cuttingData.length, 320, 440);
    noStroke();
    fill(255, 0, 0);
    text(drawErrorMessage, 10, 50);
    text(setErrorMessage, 600, 50);

    fill(0);
    text("send", 10, 470);
    text("receive", 150, 470);
    let top = parseFloat(test1TopBox.value());
    let right = parseFloat(test1RightBox.value());
    shiftX = -(top - right) / 2;
    shiftY = -(top + right - 4) / 2;
    drawComData();

    text("● state", 400, 30);
    text("connected = " + Boolean(port), 400, 50);
    text("state = ", 400, 70);
    if(state == State.run) fill(255, 0, 0);
    text("            " + state, 400, 70);
    fill(0);
    text("setXYFinished = " + setXYFinished, 400, 90);
    text("setTFinished = " + setTFinished, 400, 110);
    text("wait recieve = " + waitRecieve, 400, 130);
    text("● position", 400, 170);
    text("● knife", 400, 290);
    text("● set origin", 400, 360);
    text("● run", 400, 430);
    text("● set", 600, 80);
    text("holder down", 600, 100);
    text("holder up", 600, 120);
    text("knife down", 600, 150);
    text("knife mid", 600, 170);
    text("knife up", 600, 190);
    text("speed", 600, 220);
    text("● calibrate", 600, 260);
    text("test1 top", 600, 280);
    text("test1 right", 600, 300);
    text("test2 top", 600, 320);
    text("test2 right", 600, 340);
    text("shiftX = " + roundString(shiftX), 600, 360);
    text("shiftY = " + roundString(shiftY), 600, 380);
    text("● holder", 600, 410);
    text("key available", 600, 473);

    text("操作方法", 400, 500);
    text("① arduinoとシリアル接続する", 400, 520);
    text("② 裏にカプトンテープを貼った銅箔をテーブルに貼り付ける", 400, 540);
    text("③ テーブルの中心にカッターの先端が来るように位置を合わせ，set origin [xy]を押す", 400, 560);
    text("④ 四隅のマークに合うようにテーブルの角度を調節し，set origin [θ]を押す", 400, 580);
    text("⑤ [test1]を押し，カットされた十字の上と右の長さをcalibrate [top]，[left]に入力", 400, 600);
    text("⑥ [test2]を押し，カットされた四角のはがしやすさをset [knife down]で調節する(任意)", 400, 620);
    text("⑦ [main]を押し，完成を待つ", 400, 640);
    text("⑧ 連続して使用する場合は新しいファイルを入力する", 400, 660);

    switch(state){
        case State.waitInput:
            break;
        case State.calibrate:
            //calibrate();
            break;
        case State.run:
            run();
            break;
    }

    //arduinoから受信
    if(port){
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    reader.releaseLock();
                    break;
                }
                recieveTextBox.value(value);
                append(recieveData, value);
                cntReceive++;
                showRecieveStart = max(0, cntReceive - 10);
            }
        } catch (e) { console.error(e) }
    }
}

//--- setup draw 終了------------------------------------------------------------------
//--- 描画 開始------------------------------------------------------------------

function drawCuttingField(){
    //緑背景
    fill(0, 150, 0);
    noStroke();
    rect(-sizeCanvas / 2, -sizeCanvas / 2, sizeCanvas, sizeCanvas);

    //白罫線
    stroke(100, 255, 100);
    strokeWeight(0.2);
    for(let i = -sizeReal / 2; i <= sizeReal / 2; i += lineInterval){
        line(-sizeCanvas / 2, i * mag, sizeCanvas / 2, i * mag);
        line(i * mag, -sizeCanvas / 2, i * mag, sizeCanvas / 2);
    }

    //中心線
    stroke(200, 255, 200);
    line(-sizeCanvas / 2, 0, sizeCanvas / 2, 0);
    line(0, -sizeCanvas / 2, 0, sizeCanvas / 2);

    //下線
    stroke(255, 0, 0);
    strokeWeight(1);
    line(-sizeCanvas / 2, sizeCanvas / 2, sizeCanvas / 2, sizeCanvas / 2);
}

function drawCuttingData(){
    //カットする線
    fill(0);
    stroke(0);
    strokeWeight(1);
    cuttingData.forEach(e => {
        e.visualize();
    });
}

function drawMachineState(i){
    let offsetX = 200, offsetY = 200;
    let rot = 0;
    if(i != -1){
        offsetX += cuttingData[i].machineX * mag;
        rot = -cuttingData[i].machineT;

        //この時のマシンの変位を表示
        text("X  = " + roundString(cuttingData[i].machineX), 10, 400);
        text("Y1 = " + roundString(cuttingData[i].machineY1), 85, 400);
        text("Y2 = " + roundString(cuttingData[i].machineY2), 150, 400);
        text("Theta  = " + roundString(cuttingData[i].machineT), 220, 400);
    }

    translate(offsetX, offsetY);
    rotate(rot);
    drawCuttingField();
    rotate(-rot);
    translate(-offsetX, -offsetY);

    if(i != -1){
        fill(255, 0, 0, 150);
        noStroke();
        ellipse(200, 200 - cuttingData[i].machineY1 * mag, 10, 10);
        rect(200 - 5, 200 - cuttingData[i].machineY2 * mag - 5, 10, 10);
        stroke(255, 0, 0, 150);
        strokeWeight(1);
        for(let i = 0; i < 400; i += 20){
            line(200, i, 200, i + 10);
            line(i, 200, i + 10, 200);
        }
    }
    
    translate(offsetX, offsetY);
    rotate(rot);
    drawCuttingData();
    rotate(-rot);
    translate(-offsetX, -offsetY);
}


function drawComData(){
    let tmp = min(10, sendData.length);
    for(let i = 0; i < tmp; ++i){
        if(sendData[showSendStart + i][0] == 'X' || sendData[showSendStart + i][0] == 'Y' || sendData[showSendStart + i][0] == 'T'){
            fill(255, 210, 210);
            rect(10, 480 + i * 12, 130, 12);
        }
        fill(100);
        noStroke();
        textAlign(RIGHT);
        text(showSendStart + i, 40, 490 + i * 12);
        textAlign(LEFT);
        fill(0);
        text(sendData[showSendStart + i], 55, 490 + i * 12);
    }
    tmp = min(10, recieveData.length);
    for(let i = 0; i < tmp; ++i){
        fill(100);
        noStroke();
        textAlign(RIGHT);
        text(showRecieveStart + i, 195, 490 + i * 12);
        textAlign(LEFT);
        fill(0);
        text(recieveData[showRecieveStart + i], 205, 490 + i * 12);
    }
}

function rotPoint(x, y, theta){
    return [x * cos(theta) - y * sin(theta), 
            x * sin(theta) + y * cos(theta)];
}


//--- 描画 終了------------------------------------------------------------------
//--- ファイル読み込み 開始------------------------------------------------------------------

function cuttingFileSchedule(file, isMain = false){
    var result = [];
    lines = [];
    try{
        let lineNo = 0;
        file.forEach(e => {
            lineNo++;
            if(e != ""){
                let v = e.split(" ");
                if(v.length != 4) throw("[line " + lineNo.toString() + "] " + e + "\nx1 y1 x2 y2の形式で入力してください");
                vFloat = [];
                for(let i = 0; i < 4; ++i){
                    let val = parseFloat(v[i]);
                    if(isNaN(val)) throw("[line " + lineNo.toString() + "] " + e + "\n値が無効です");
                    if(val < -30 && 30 < val) throw("[line " + lineNo.toString() + "] " + e + "\n座標は-30以上30以下にしてください");
                }
                append(lines, new Line(parseFloat(v[0]), parseFloat(v[1]), parseFloat(v[2]), parseFloat(v[3])));
            }
        });
        lines.sort((x, y) => {
            if(abs(x.machineT - y.machineT) > eps) return x.machineT - y.machineT;
            else if(abs(x.machineX - y.machineX) > eps) return x.machineX - y.machineX;
            else return x.machineY1 - y.machineY1;
        });
        lines.forEach(e => {
            e.addSchedule(result);
        });
        append(result, new Order(OrderType.knife, 2));
        append(result, new Order(OrderType.x, 0));
        append(result, new Order(OrderType.y, 0));
        append(result, new Order(OrderType.theta, 0));
        if(isMain){
            cuttingData = lines;
        }
        drawErrorMessage = "";
    }catch(error){
        drawErrorMessage = error;
    }
    return result;
}

function fileInputed(file){
    if(file.name.split(".").pop() == "txt"){
        mainSchedule = cuttingFileSchedule(file.data.split(/\r\n|\n|\r/), true);
        print("main", mainSchedule);
    }else{
        drawErrorMessage = "txtファイルを入力してください";
    }
}

function setFileInputed(file){
    if(file.name.split(".").pop() == "txt"){
        updateSetData(file.data.split(/\r\n|\n|\r/), true);
    }else{
        drawErrorMessage = "txtファイルを入力してください";
    }
}

function updateSetData(file){
    print("set", file);
    try{
        let lineNo = 0;
        file.forEach(e => {
            lineNo++;
            if(e != ""){
                let v = e.split(" ");
                if(v.length != 2) throw("[line " + lineNo.toString() + "] " + e + "\nname valueの形で入力してください");
                if(isNaN(parseInt(v[1]))) throw("[line " + lineNo.toString() + "] " + e + "valueが不正です");
                switch(v[0]){
                    case "holderDown": holderDownBox.value(parseInt(v[1])); break;
                    case "holderUp": holderUpBox.value(parseInt(v[1])); break;
                    case "knifeDown": knifeDownBox.value(parseInt(v[1])); break;
                    case "knifeMid": knifeMidBox.value(parseInt(v[1])); break;
                    case "knifeUp": knifeUpBox.value(parseInt(v[1])); break;
                    case "speed": speedBox.value(parseInt(v[1])); break;
                    default: throw("[line " + lineNo.toString() + "] " + e + "\nnameが不正です");
                }
            }
        });
        setErrorMessage = "";
    }catch(error){
        setErrorMessage = error;
    }
}

//--- ファイル読み込み 終了------------------------------------------------------------------
//--- 通信 開始------------------------------------------------------------------

function copyOrder(orders){
    let result = [];
    orders.forEach(e =>{
        print("e = ", e);
        append(result, e.copy());
    });
    return result;
}

async function sendOrder(order){
    if(preOrder.type == order.type && preOrder.val == order.val) return;
    preOrder = order;
    order.no = orderNo++;
    message = order.toString() + "\n";
    if(port){
        try{
            await writer.write(message);
        }catch(e){console.error(e)};
    }
    sendTextBox.value(message);
    append(sendData, message);
    cntSend++;
    showSendStart = max(0, cntSend - 10);
}

async function send(type, val = 0, lineNo = -1){
    sendOrder(new Order(type, val, lineNo));
}

//--- 通信 終了------------------------------------------------------------------
//--- 操作 開始------------------------------------------------------------------

function keyPressed(){
    if(waitRecieve) return;
    if(!keyAvailableChbox.checked()) return;
    switch(key){
        case ',': ccwBtnPressed(); break;
        case '.': cwBtnPressed(); break;
        //case 'k': knifeDownBtnPressed(); break;
        //case 'p': knifeMidBtnPressed(); break;
        //case 'q': knifeUpBtnPressed(); break;
        //case 'O': setXYBtnPressed(); break;
        //case 'i': setTBtnPressed(); break;
        //case 'o': break;
        //case 'z': break;
    }
    switch(keyCode){
        case UP_ARROW: upBtnPressed(); break;
        case DOWN_ARROW: downBtnPressed(); break;
        case LEFT_ARROW: leftBtnPressed(); break;
        case RIGHT_ARROW: rightBtnPressed(); break;
        //case ESCAPE: state = State.calibrate; break;
        /*case ENTER:
            if(setXYFinished && setTFinished){
                state = State.run;
                idxSchedule = 0;
                schedule = copyOrder(cuttingSchedule);
                waitRecieve = false;
            }
            break;*/
    }
}

function keyReleased(){
    if(waitRecieve) return;
    send(OrderType.none);
}

function wheelMoved(e){ 
    if(0 <= mouseX && mouseX <= 150 && 500 <= mouseY && mouseY <= 800){
        if(e.deltaY < 0 && showSendStart > 0){
            showSendStart--;
        }else if(e.deltaY > 0 && showSendStart + 10 < sendData.length){
            showSendStart++;
        }
    }
    if(150 < mouseX && mouseX <= 300 && 500 <= mouseY && mouseY <= 800){
        if(e.deltaY < 0 && showRecieveStart > 0){
            showRecieveStart--;
        }else if(e.deltaY > 0 && showRecieveStart + 10 < recieveData.length){
            showRecieveStart++;
        }
    }
}

//--- 操作 終了------------------------------------------------------------------
//--- ボタン 開始----------------------------------------------------------------

function upBtnPressed(){
    send(OrderType.up, parseInt(speedBox.value()));
}

function downBtnPressed(){
    send(OrderType.up, -parseInt(speedBox.value()));
}

function leftBtnPressed(){
    send(OrderType.right, parseInt(speedBox.value()));
}

function rightBtnPressed(){
    send(OrderType.right, -parseInt(speedBox.value()));
}

function cwBtnPressed(){
    send(OrderType.cw, -parseInt(speedBox.value()));
}

function ccwBtnPressed(){
    send(OrderType.cw, parseInt(speedBox.value()));
}

function knifeDownBtnPressed(){
    send(OrderType.knife, parseInt(knifeDownBox.value()));
}

function knifeMidBtnPressed(){
    send(OrderType.knife, parseInt(knifeMidBox.value()));
}

function knifeUpBtnPressed(){
    send(OrderType.knife, parseInt(knifeUpBox.value()));
}

function setXYBtnPressed(){
    send(OrderType.setXY, 0);
    send(OrderType.knife, parseInt(knifeUpBox.value()));
    setXYFinished = true;
}

function setTBtnPressed(){
    send(OrderType.setTheta, 0);
    setTFinished = true;
}

function test1BtnPressed(){
    if(!runAvalilable()) return;
    state = State.run;
    idxSchedule = 0;
    schedule = copyOrder(test1Schedule);
    waitRecieve = false;
    test1Finished = true;
    test2Btn.style("color", color(0));
    mainBtn.style("color", color(0));
}

function test2BtnPressed(){
    if(!runAvalilable()) return;

    state = State.run;
    idxSchedule = 0;
    schedule = copyOrder(test2Schedule);
    waitRecieve = false;
    test2Finished = true;
}

function mainBtnPressed(){
    if(!runAvalilable()) return;

    state = State.run;
    idxSchedule = 0;
    schedule = copyOrder(mainSchedule);
    waitRecieve = false;
    test2Finished = true;
}

function holderUpBtnPressed(){
    send(OrderType.hold, parseInt(holderUpBox.value()));
}

function holderDownBtnPressed(){
    send(OrderType.hold, parseInt(holderDownBox.value()));
}

function calibrateEnterBtnPressed(){
    state = State.run;
    idxSchedule = 0;
    schedule = [new Order(OrderType.x, shiftX), 
                new Order(OrderType.y, shiftY),
                new Order(OrderType.setXY)];
    waitRecieve = false;
    test1TopBox.value("2.0");
    test1RightBox.value("2.0");
    test2TopBox.value("0.0");
    test2RightBox.value("0.0");
}

function saveSetBtnPressed(){
    let data = [
        "holderDown " + holderDownBox.value().toString(), 
        "holderUp " + holderUpBox.value().toString(),  
        "knifeDown " + knifeDownBox.value().toString(),  
        "knifeMid " + knifeMidBox.value().toString(),  
        "knifeUp " + knifeUpBox.value().toString(),  
        "speed " + speedBox.value().toString(),  
    ];
    saveStrings(data, "setting_cuttingMachine.txt");
}

function boxMousePressed(){
    keyAvailableChbox.checked(false);
}

function calibrateChanged1(){
    test2TopBox.value(parseFloat(test1TopBox.value()) - 2.0);
    test2RightBox.value(parseFloat(test1RightBox.value()) - 2.0);
}

function calibrateChanged2(){
    test1TopBox.value(parseFloat(test2TopBox.value()) + 2.0);
    test1RightBox.value(parseFloat(test2RightBox.value()) + 2.0);
}

function originBtnPressed(){
    send(OrderType.x, 0);
    send(OrderType.y, 0);
    send(OrderType.theta, 0);
}

//--- ボタン 終了------------------------------------------------------------------
//--- その他 開始------------------------------------------------------------------

async function run(){
    if(waitRecieve){
        if(parseInt(recieveTextBox.value()) == schedule[idxSchedule].no){
            waitRecieve = false;
            idxSchedule++;
        }
        return;
    }
    if(idxSchedule == schedule.length){
        state = State.calibrate;
        return;
    }
    sendOrder(schedule[idxSchedule]);
    slider.value(schedule[idxSchedule].lineNo);
    waitRecieve = true;
}

function runAvalilable(showAlert = false){
    if(!setXYFinished){
        if(showAlert) window.alert("set xyが完了していません");
        return false;
    }else if(!setTFinished){
        if(showAlert) window.alert("set θが完了していません");
        return false;
    }else if(!(test1TopBox.value() == "2.0" && test1RightBox.value() == "2.0")){
        if(showAlert) window.alert("calibrationのokが押されていません");
        return false;
    }
    return true;
}

function roundString(val){
    return String(round(val * 10000) / 10000);
}

function windowResized() {
    upBtn.position(460, 175);
    leftBtn.position(435, 200);
    rightBtn.position(485, 200);
    downBtn.position(460, 225);
    cwBtn.position(510, 200);
    ccwBtn.position(410, 200);
    knifeDownBtn.position(400, 300);
    knifeMidBtn.position(450, 300);
    knifeUpBtn.position(500, 300);
    setXYBtn.position(400, 370);
    setTBtn.position(450, 370);
    originBtn.position(500, 370);
    test1Btn.position(400, 440);
    test2Btn.position(450, 440);
    mainBtn.position(500, 440);
    saveSetBtn.position(700, 65);
    setFInput.position(580, 10);
    holderDownBox.position(700, 88);
    holderUpBox.position(700, 108);
    knifeDownBox.position(700, 138);
    knifeMidBox.position(700, 158);
    knifeUpBox.position(700, 178);
    speedBox.position(700, 208);
    calibrateEnterBtn.position(700, 246);
    test1TopBox.position(700, 266);
    test1RightBox.position(700, 286);
    test2TopBox.position(700, 306);
    test2RightBox.position(700, 326);
    holderDownBtn.position(600, 420);
    holderUpBtn.position(650, 420);
    keyAvailableChbox.position(700, 460);
}
//--- その他 終了------------------------------------------------------------------