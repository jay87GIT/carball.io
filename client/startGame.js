
import SocketWrapper from './components/ws';
import io from 'socket.io-client';
import * as PIXI from 'pixi.js';
import SoccerBallObject from './components/SoccerBallObject';
import PlayerObject from './components/PlayerObject';
import createTiles from './components/Tiles';
import GoalPostClient from './components/GoalPostObject';
import { formatTime } from './components/utils';

export default function startGame() {

    const app = new PIXI.Application({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0xAAAAAA
    });
    document.body.appendChild(app.view);
    document.body.style.margin = "0"; // remove default margins
    app.renderer.view.style.position = "absolute";
    app.renderer.view.style.display = "block";

   


    const players = {};

    const socket = new SocketWrapper();

    //throw all global variables in here
    const client = {
        lastUpdate: Date.now(),
        score: {
            blue: 0,
            red: 0
        },
        ball: null,
        viewTarget: "self",
        lastViewChange: 0,
        gameEnds: 0,
        serverType: null,
        team: null,
        boost: 0,
        chat: "",
        chatOpen: false,
        you: null
    }

    createTiles(app);

    //create chat display
    client.chatDisplay = new PIXI.Text("", { font: "10px Arial", fill: "black" });
    client.chatDisplay.anchor.set(0.5, 0.5);
    client.chatDisplay.x = 0;
    client.chatDisplay.y = 0;
    app.stage.addChild(client.chatDisplay);

    let soccerBall = new SoccerBallObject(375, 275, 0, app);  // You can initialize it with your own starting x, y
    client.ball = soccerBall; //reference to soccerball

    socket.on('id', (id) => {

        client.socketid = id;

        console.log('Connected to server!');

        socket.emit("join", document.getElementById("nameInput").value)
    });

    let activeKeys = {};
    let movementMode = document.querySelector('input[name="controls"]:checked').value;


    function sendChat(text) {
        socket.emit("chat", text);
    }

    document.addEventListener('keydown', (event) => {
        let e = event;

        if (e.key == "Enter") {
            if (client.chatOpen) {
                sendChat(client.chat);
                client.chat = "";
                client.chatDisplay.text = "";
            }

            client.chatOpen = !client.chatOpen;
            return;
        }

        if (client.chatOpen) {
            if (e.key.length == 1) {
                client.chat += e.key;
            }
            if (e.key == "Backspace") {
                client.chat = client.chat.substring(0, client.chat.length - 1);
            }
            client.chatDisplay.text = client.chat;
            return;
        }

        //e.keyCode SUCKS 
        if (e.key == " ") {
            socket.emit("boost");
            return;
        }

        switch (event.keyCode) {
            case 37: // Left
                activeKeys['left'] = true;
                break;
            case 38: // Up
                activeKeys['up'] = true;
                break;
            case 39: // Right
                activeKeys['right'] = true;
                break;
            case 40: // Down
                activeKeys['down'] = true;
                break;
        }
        if (movementMode === 'keys') emitPlayerMovement();
    });

    document.addEventListener('keyup', (event) => {
        switch (event.keyCode) {
            case 37: // Left
                activeKeys['left'] = false;
                break;
            case 38: // Up
                activeKeys['up'] = false;
                break;
            case 39: // Right
                activeKeys['right'] = false;
                break;
            case 40: // Down
                activeKeys['down'] = false;
                break;
        }
        if (movementMode === 'keys') emitPlayerMovement();
    });

    window.enableMobileControls = function () {
        $("mobile").style.visibility = "visible";
        client.mobile = true;
        let controls = document.getElementById("mobile");
        controls.addEventListener("touchstart", (e) => {
            let type = e.target.getAttribute("z");
            switch (type) {
                case "left":
                    activeKeys['left'] = true;
                    break;
                case "right":
                    activeKeys['right'] = true;
                    break;
                case "up":
                    activeKeys['up'] = true;
                    break;
                case "down":
                    activeKeys['down'] = true;
                    break;
                case "boost":
                    socket.emit("boost");
                    break;
            }
            emitPlayerMovement();
        });
        controls.addEventListener("touchend", (e) => {
            let type = e.target.getAttribute("z");
            switch (type) {
                case "left":
                    activeKeys['left'] = false;
                    break;
                case "right":
                    activeKeys['right'] = false;
                    break;
                case "up":
                    activeKeys['up'] = false;
                    break;
                case "down":
                    activeKeys['down'] = false;
                    break;
            }
            emitPlayerMovement();
        });
    }
    if(window.matchMedia("(pointer: coarse)").matches)
        enableMobileControls();

    // Variables to store the position of the pointer
    let mouseX = 0;
    let mouseY = 0;
    let angleDegrees;

    document.addEventListener('mousemove', (event) => {
        // Update the position of the pointer
        mouseX = event.clientX;
        mouseY = event.clientY;

        // Calculate the angle using atan2
        const angle = Math.atan2(mouseY - window.innerHeight / 2, mouseX - window.innerWidth / 2);
        const dist = Math.hypot(mouseY - window.innerHeight / 2, mouseX - window.innerWidth / 2);

        // Convert the angle to degrees
        angleDegrees = angle * 180 / Math.PI;
        angleDegrees += 180;

        // normalize to -180 to 180
        angleDegrees = (angleDegrees) % 360 - 180;
        // angleDegrees *= -1;

        if (movementMode === 'mouse') {
            activeKeys['angle'] = Math.round(angleDegrees);
            activeKeys['forward'] = (dist > 100);
            emitPlayerMovement();
        }

    });

    function emitPlayerMovement() {
        socket.emit('move', activeKeys)
    }

    socket.on("deletePlayer", (id) => {
        deletePlayer(id);
    });

    function deletePlayer(id) {
        app.stage.removeChild(players[id].sprite);
        delete players[id];
    }

    let goalPosts = {};

    //info when join a match (includes lobby)
    socket.on("info", (serverId, serverType, team) => {
        client.serverType = serverId;
        console.log("Entered server: " + serverId);
        client.team = team;
        //reset this 
        for (let i in players) {
            deletePlayer(i);
        }

        if (serverType == "lobby") return;
        //start countdown
        $("countdown").style.visibility = "visible";
        countdown(3);
    });

    function countdown(number) {
        $("countdown").innerHTML = number;
        $("countdown").style["font-size"] = (5 - number / 2) + "em";
        $("countdown").style.color = `rgb(${(number) * 255}, ${(3-number)*255}, 0)`;

        if (number == 0) {
            $("countdown").innerHTML = "Go!";
            setTimeout(() => {
                $("countdown").style.visibility = "hidden";
            }, 1000);
            return;
        };

        setTimeout(() => {
            countdown(number-1);
        }, 1000);
    }

    //set player property
    socket.on("player", (id, prop, data) => {
        if (prop == "chat") {
            players[id].setChat(data); 
            return;
        }
        players[id][prop] = data;
    }); 

    socket.on("end", () => {
        console.log("gameend");
        $("blueFinal").innerHTML = client.score.blue;
        $("redFinal").innerHTML = client.score.red;
        document.getElementById("matchInfo").style.visibility = "visible";


        if (client.score.blue == client.score.red) {
            $("winlose").innerHTML = "Tie!";
            return;
        }

        let text = "You ";
        let winner = "";

        if (client.score.blue > client.score.red) {
            winner = "blue";
        } else {
            winner = "red";
        }

        if (client.team == winner) {
            text += "won!";
        } else {
            text += "lost!";
        }

        text += " " + winner + " team won!"

        $("winlose").innerHTML = text;
    });
    
    socket.on("score", (score, scorer, team) => {
        client.score = score;
        document.getElementById("blue").innerHTML = client.score.blue;
        document.getElementById("red").innerHTML = client.score.red;

        if (client.serverType == "lobby") {
            document.getElementById("blue").innerHTML = "";
            document.getElementById("red").innerHTML = "";
        }

        //make it so dont pan at start
        if (score.red == 0 && score.blue == 0) return;
        
        client.viewTarget = "ball";
        client.lastViewChange = Date.now();
        setTimeout(() => {
            client.viewTarget = "self";
            client.lastViewChange = Date.now();
        }, 1900);

        if (scorer == null) return; //this means someone got the goal to change the score
        console.log(scorer + team);
        $("goal").innerHTML = scorer + " scored!";
        $("goal").style.left = "0%";

        setTimeout(() => {
            $("goal").style.left = "100%";
        }, 3000)
    });

    socket.on("time", (remaining) => {
        client.gameEnds = Date.now() + remaining;
    });

    socket.on('goalPosts', ({ leftGoal, rightGoal }) => {
        if (goalPosts.leftGoal) {
            goalPosts.leftGoal.clear();
        }
        if (goalPosts.rightGoal) {
            goalPosts.rightGoal.clear();
        }
        // Create goal posts
        if (leftGoal) {
            goalPosts.leftGoal = new GoalPostClient(app, leftGoal);
            goalPosts.leftGoal.draw();
        }
        if (rightGoal) {
            goalPosts.rightGoal = new GoalPostClient(app, rightGoal);
            goalPosts.rightGoal.draw();
        }
    });

    socket.on('update', ({ updatedPlayers, ball, leftGoal, rightGoal }) => {
        for (let id in updatedPlayers) {
            // Minus 90 degrees because the sprite is facing up
            

            updatedPlayers[id].angle -= Math.PI / 2;
            if (players[id]) {
                players[id].updatePosition(updatedPlayers[id].x, updatedPlayers[id].y, updatedPlayers[id].angle, client);
                players[id].boost = updatedPlayers[id].boost;
            } else {
                players[id] = new PlayerObject(id, updatedPlayers[id].x, updatedPlayers[id].y, id === client.socketid, app, client, updatedPlayers[id].name, updatedPlayers[id].team);
                if (id == client.socketid)
                    client.you = players[id];
            }
        }

        handleSoccerBall(ball);

        client.lastUpdate = Date.now();
    });



    function handleSoccerBall(ballData) {
        soccerBall.updatePosition(ballData.x, ballData.y, ballData.angle, client);
    }

    let ticker = app.ticker.add(() => {
        // Interpolate player positions
        for (let id in players) {
            players[id].interpolatePosition(client);
        }

        // Check active keys and send movement
        //emitPlayerMovement();
        soccerBall.interpolatePosition(client);
       
    });

    //update timers and stuff not every render tick to make it super fast
    let guiTick = setInterval(() => {
        if (client.you == null) return;

        $("speedometer").innerHTML = Math.round(client.you.speed * 1) / 1 + "mph";
        let boost = client.you.boost;
        if (boost < 0) boost = 0;
        $("boostBarPercent").style.width = (100 - Math.round(100 * boost / 240)) + "%";

        if (client.serverType == "lobby") {
            document.getElementById("time").innerHTML = "Waiting for match... " + formatTime(client.gameEnds - Date.now());
        } else {
            document.getElementById("time").innerHTML = formatTime(client.gameEnds - Date.now());
        }
    }, 300);

    //clean up the game cuz u made it set everything when u start a function
    function cleanup() {
        clearInterval(guiTick);
    }

    window.addEventListener('resize', function () {
        app.renderer.resize(window.innerWidth, window.innerHeight);
    });



    return {
        app: app,
        cleanup: cleanup
    }
}