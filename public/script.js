fetch('https://api.ipify.org?format=json')
  .then(response => response.json())
  .then(data => {
    //document.getElementById("ipAddress").innerText = "Your IP Address is: " + data.ip;
    fetch('/save-ip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ip: data.ip }),
      })
        .then(response => response.json())
        .then(data => console.log(data))
        .catch(error => console.error('Error:', error));
  })
  .catch(error => {
    console.error('Error:', error);
    document.getElementById("ipAddress").innerText = "Failed to fetch IP address.";
  });


  document.getElementById("dashboardBtn").addEventListener("click", async () => {
    try {
      const response = await fetch("/dashboard", {
        method: "POST", // Cambia in "POST" se necessario
        headers: {
          "Content-Type": "application/json", // Imposta il tipo di contenuto
        },
      });
    } catch (error) {
      console.error("Errore di rete:", error);
      alert("Si è verificato un errore di rete.");
    }
  });