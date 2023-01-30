import React, { useContext, useEffect } from "react";
import './App.css';
import { SocketContext } from "./context/SocketContext";

function custom_sort(a, b) {
  return new Date(a.timeCreated).getTime() - new Date(b.timeCreated).getTime();
}

function Dashboard() {

    const socket = useContext(SocketContext);

    const [data, setData] = React.useState([]);

    useEffect(() => {
        socket.on("update", (socket) => {
            console.log(socket.items)
            setData(socket.items)
        })
        socket.on("connect", (value) => {
          console.log(socket.id)
        })
      })

    return (
    <div className="Dashboard">
      <div className="Header">
        <h1>Gear Exchange Database</h1>
      </div>
      <div className="CardWrapper">
        {data.sort(custom_sort).reverse().map(function (value, index, array) {

            value = JSON.parse(value)

            return (
                <div className="Card" key={index}>
                    <h1 className="Card-Title">{`${value.firstName} ${value.lastName}`}</h1>
                </div>
            )
        })}
      </div>
    </div>
  );
}

export default Dashboard;
