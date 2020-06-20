import express, { Application } from "express";
import socketIO, { Server as SocketIOServer } from "socket.io";
import redisAdapter from 'socket.io-redis';
import { createServer, Server as HTTPServer } from "http";
import path from "path";

// ROOMS
const CONSULTATION = 'CONSULTATION'
const LESSON = 'LESSON'

export class Server {
  private httpServer: HTTPServer;
  private app: Application;
  private io: SocketIOServer;
  // private ioNs;

  private sockets: any[] = [];

  private readonly DEFAULT_PORT = 5100;
  private readonly REDIS_HOST = 'localhost';
  private readonly REDIS_PORT = 6379;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = socketIO(this.httpServer);
    // this.ioNs = this.io.of(this.NAME_SPACE);

    this.io.adapter(redisAdapter({
      host: this.REDIS_HOST,
      port: this.REDIS_PORT,
    }))

    this.configureApp();
    this.configureRoutes();
    this.handleSocketConnection(this.io);
    // this.handleSocketConnection(this.ioNs);
  }

  private getRoomByIndex(index: number): string {
    const roomToJoin = index % 2 === 1 ? CONSULTATION : LESSON;

    return roomToJoin
  }

  private configureApp(): void {
    this.app.use(express.static(path.join(__dirname, "../public")));
  }

  private configureRoutes(): void {
    this.app.get("/", (req, res) => {
      res.sendFile("index.html");
    });
  }

  private handleSocketConnection(io): void {

    io.on("connection", socket => {
      const existingSocket = this.sockets.find(
        existingSocket => existingSocket.id === socket.id
      );

      if (!existingSocket) {
        this.sockets.push(socket);

        const roomToJoin = this.getRoomByIndex(this.sockets.length)

        socket.join(roomToJoin, () => {
          const users = this.sockets.filter(
            existingSocket => {
              const isNotThis = existingSocket.id !== socket.id;
              const isSameRoom = !!existingSocket.rooms[roomToJoin]

              return isNotThis && isSameRoom
            }
          ).map(({ id }) => id)

          console.log('users', users)

          socket.emit("update-user-list", {
            users,
          });

          socket.broadcast.to(roomToJoin).emit("update-user-list", {
            users: [socket.id],
          });

          setTimeout(() => {
            const msg = `SocketId ${socket.id}, room ${roomToJoin}`
            io.emit('enter', { msg })

            console.log('this.sockets', this.sockets.map(({ id }) => id))
          }, 1000)
        })
      }

      // socket.to(CONSULTATION).on('call-user', (data: any) => {
      socket.on('call-user', (data: any) => {
        socket.to(data.to).emit('call-made', {
          offer: data.offer,
          socket: socket.id
        });
      });

      // socket.to(CONSULTATION).on('make-answer', data => {
      socket.on('make-answer', data => {
        socket.to(data.to).emit('answer-made', {
          socket: socket.id,
          answer: data.answer
        });
      });

      // socket.to(CONSULTATION).on("reject-call", data => {
      socket.on("reject-call", data => {
        socket.to(data.from).emit("call-rejected", {
          socket: socket.id
        });
      });

      socket.on("disconnect", () => {
        this.sockets = this.sockets.filter(
          existingSocket => existingSocket.id !== socket.id
        );
        socket.broadcast.emit("remove-user", {
          socketId: socket.id
        });
      });
    });
  }

  public listen(callback: (port: number) => void): void {
    this.httpServer.listen(this.DEFAULT_PORT, () => {
      callback(this.DEFAULT_PORT);
    });
  }
}
