import express, { Application } from "express";
import socketIO, { Server as SocketIOServer } from "socket.io";
import redisAdapter from 'socket.io-redis';
import { createServer, Server as HTTPServer } from "http";
import path from "path";

// ROOMS
// const CONSULTATION = 'CONSULTATION'
// const LESSON = 'LESSON'

const DELAY = 5000

export class Server {
  private httpServer: HTTPServer;
  private app: Application;
  private io: SocketIOServer;
  private ioChat;

  private socketsVideo: any[] = [];
  private socketsChat: any[] = [];

  private readonly DEFAULT_PORT = 5100;
  private readonly REDIS_HOST = 'localhost';
  private readonly REDIS_PORT = 6379;
  private readonly NAME_SPACE = '/chat';

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = socketIO(this.httpServer);
    this.ioChat = this.io.of(this.NAME_SPACE);

    this.io.adapter(redisAdapter({
      host: this.REDIS_HOST,
      port: this.REDIS_PORT,
    }))

    this.configureApp();
    this.configureRoutes();

    this.io.on('connection', socket => {
      this.socketsVideo.push(socket);

      const { length } = this.socketsVideo

      if (length === 1 || length === 3) {
        console.log('handleSocketConnectionVideo')
        this.handleSocketConnectionVideo(socket);
      }
    })

    this.ioChat.on('connection', socket => {
      this.socketsChat.push(socket);

      const { length } = this.socketsChat

      if (length === 2 || length === 3) {
        console.log('handleSocketConnectionChat')
        this.handleSocketConnectionChat(socket);
      }
    })
  }

  private configureApp(): void {
    this.app.use(express.static(path.join(__dirname, "../public")));
  }

  private configureRoutes(): void {
    this.app.get("/", (req, res) => {
      res.sendFile("index.html");
    });
  }

  private pingPongSubscribe(socket) {
    socket.on('chat-pong', msg => {
      console.log('chat-pong', msg)
      setTimeout(() => {
        socket.broadcast.emit('chat-ping', 'ping')
      }, DELAY)
    });

    socket.on('chat-ping', msg => {
      console.log('chat-ping', msg)
      setTimeout(() => {
        socket.broadcast.emit('chat-pong', 'pong')
      }, DELAY)
    })
  }

  private handleSocketConnectionVideo(socket) {
    const users = this.socketsVideo.filter(
      existingSocket => {
        const isNotThis = existingSocket.id !== socket.id;
        const isVideoNameSpace = socket.nsp.name === '/'

        return isNotThis && isVideoNameSpace
      }
    ).map(({ id }) => id)

    console.log('users', users)

    socket.emit("update-user-list", {
      users,
    });

    socket.broadcast.emit("update-user-list", {
      users: [socket.id],
    });

    socket.on('call-user', (data: any) => {
      socket.to(data.to).emit('call-made', {
        offer: data.offer,
        socket: socket.id
      });
    });

    socket.on('make-answer', data => {
      socket.to(data.to).emit('answer-made', {
        socket: socket.id,
        answer: data.answer
      });
    });

    socket.on("reject-call", data => {
      socket.to(data.from).emit("call-rejected", {
        socket: socket.id
      });
    });

    socket.on("disconnect", () => {
      this.socketsVideo = this.socketsVideo.filter(
        existingSocket => existingSocket.id !== socket.id
      );
      socket.broadcast.emit("remove-user", {
        socketId: socket.id
      });
    });
  }

  private handleSocketConnectionChat(socket) {
    this.pingPongSubscribe(socket)

    if (this.socketsChat.length === 3) {
      console.log('emit chat-ping in 5 sec')
      setTimeout(() => {
        socket.broadcast.emit('chat-ping', 'ping')
      }, DELAY)
    }
  }

  public listen(callback: (port: number) => void): void {
    this.httpServer.listen(this.DEFAULT_PORT, () => {
      callback(this.DEFAULT_PORT);
    });
  }
}
