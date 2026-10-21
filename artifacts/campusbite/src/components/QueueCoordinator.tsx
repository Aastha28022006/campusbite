import { useEffect } from "react";
import { toast } from "sonner";
import {
  getMyOrders,
  getTrackedOrderIds,
  notifyReadyOnce,
  startPreparationQueue,
  subscribeToOrders,
} from "@/lib/campusbite";

export function QueueCoordinator() {
  useEffect(() => {
    const stopQueue = startPreparationQueue((error) => {
      toast.error("Order queue paused", { description: error.message });
    });
    let checking = false;
    const checkReadyOrders = async () => {
      if (checking) return;
      const ids = getTrackedOrderIds();
      if (!ids.length) return;
      checking = true;
      try {
        const orders = await getMyOrders(ids);
        for (const order of orders) {
          if (order.status === "Ready") await notifyReadyOnce(order);
        }
      } catch (error) {
        console.error("Could not refresh CampusBite order notifications.", error);
      } finally {
        checking = false;
      }
    };
    const unsubscribe = subscribeToOrders(() => void checkReadyOrders());
    const timer = window.setInterval(() => void checkReadyOrders(), 1500);
    void checkReadyOrders();
    const notificationHandler = (event: Event) => {
      const { orderId } = (event as CustomEvent<{ orderId: number }>).detail;
      toast.success(`Order #${orderId}: Your CampusBite order is ready! Please collect it from the canteen.`, {
        duration: 10000,
      });
    };
    window.addEventListener("campusbite:ready-notification", notificationHandler);
    return () => {
      stopQueue();
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("campusbite:ready-notification", notificationHandler);
    };
  }, []);

  return null;
}
