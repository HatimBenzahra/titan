import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TasksGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TasksGateway.name);
  private taskSubscriptions = new Map<string, Set<string>>(); // taskId -> Set of socketIds

  handleConnection(client: Socket) {
    this.logger.log(`WebSocket client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`WebSocket client disconnected: ${client.id}`);

    // Clean up subscriptions
    for (const [taskId, clients] of this.taskSubscriptions.entries()) {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.taskSubscriptions.delete(taskId);
      }
    }
  }

  @SubscribeMessage('subscribe_task')
  handleSubscribeTask(client: Socket, taskId: string) {
    if (!this.taskSubscriptions.has(taskId)) {
      this.taskSubscriptions.set(taskId, new Set());
    }

    this.taskSubscriptions.get(taskId)!.add(client.id);
    this.logger.log(`Client ${client.id} subscribed to task ${taskId}`);

    client.emit('subscribed', { taskId });
    return { success: true, taskId };
  }

  @SubscribeMessage('unsubscribe_task')
  handleUnsubscribeTask(client: Socket, taskId: string) {
    const clients = this.taskSubscriptions.get(taskId);
    if (clients) {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.taskSubscriptions.delete(taskId);
      }
    }

    this.logger.log(`Client ${client.id} unsubscribed from task ${taskId}`);
    return { success: true, taskId };
  }

  /**
   * Broadcast event to all clients subscribed to a task
   */
  broadcastTaskEvent(taskId: string, event: { type: string; data: any }) {
    const clients = this.taskSubscriptions.get(taskId);

    if (clients && clients.size > 0) {
      const clientsArray = Array.from(clients);
      clientsArray.forEach(clientId => {
        this.server.to(clientId).emit('task_event', {
          taskId,
          ...event
        });
      });

      this.logger.debug(`Broadcasted ${event.type} to ${clients.size} clients for task ${taskId}`);
    }
  }
}
