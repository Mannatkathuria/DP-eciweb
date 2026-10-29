import { useEffect, useState } from "react";
import api from "../api/axios.js"; // Adjust path to your API instance
import "./PhoneScreen.css";

export default function PhoneScreen() {
    const [time, setTime] = useState(new Date());
    const [notifications, setNotifications] = useState([]);

    useEffect(() => {
        const updateTime = () => setTime(new Date());

        const timer = setInterval(updateTime, 1000);
        return () => clearInterval(timer);
    }, []);

    
    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                const epic = localStorage.getItem("epic");

                if (!epic) {
                    console.warn("No EPIC found in localStorage");
                    return;
                }

                const res = await api.get("/notifications", {
                    params: { epic }
                });

                console.log("Notifications API response:", res.data);

                setNotifications(res.data.data.notifications || []);
            } catch (error) {
                console.error(
                    "Notifications API failed:",
                    error.response?.status,
                    error.response?.data || error.message
                );
            }
        };

        fetchNotifications();

        const interval = setInterval(fetchNotifications, 3000);

        return () => clearInterval(interval);
    }, []);


    return (
        <div className="phone-wrapper">
            <div className="phone">
                <div className="phone-screen">
                    <div className="dynamic-island" />

                    <div className="status-bar">
                        <span>
                            {time.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </span>
                        <span className="status-icons">● Wi-Fi ▰</span>
                    </div>

                    <div className="lock-screen">
                        <div className="lock-date">
                            {time.toLocaleDateString([], {
                                weekday: "long",
                                month: "long",
                                day: "numeric",
                            })}
                        </div>

                        <div className="lock-time">
                            {time.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                            })}
                        </div>

                        <div className="notifications">
                            <div className="notification-heading">
                                NOTIFICATIONS
                                <span>{notifications.length}</span>
                            </div>

                            {notifications.length === 0 ? (
                                <div className="empty-notifications">
                                    No notifications
                                </div>
                            ) : (
                                notifications.map((notification, index) => (
                                    <div
                                        className="notification-card"
                                        key={notification._id || notification.id || index}
                                    >
                                        <div className="notification-icon">
                                            {notification.icon || "🔔"}
                                        </div>

                                        <div className="notification-content">
                                            <div className="notification-top">
                                                <strong>
                                                    {notification.app ||
                                                        notification.source ||
                                                        "Notification"}
                                                </strong>
                                                <span>
                                                    {notification.time || "now"}
                                                </span>
                                            </div>

                                            <div className="notification-title">
                                                {notification.title ||
                                                    "New notification"}
                                            </div>

                                            <div className="notification-body">
                                                {notification.body ||
                                                    notification.message ||
                                                    ""}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="lock-screen-footer">
                        <button type="button" aria-label="Flashlight">
                            ◉
                        </button>
                        <div className="home-indicator" />
                        <button type="button" aria-label="Camera">
                            ◎
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}