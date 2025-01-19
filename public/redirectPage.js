async function fetchData(link, short_link) {
  await fetch('https://api.ipify.org?format=json')
    .then(response => response.json())
    .then(data => {
      //document.getElementById("ipAddress").innerText = "Your IP Address is: " + data.ip;
      fetch('/save-ip', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ip: data.ip, link: short_link}),
        })
          .then(response => response.json())
          .then(data => console.log(data))
          .catch(error => console.error('Error:', error));
  })
  redirectToExternalLink(link);
}

  function redirectToExternalLink(link) {
    window.location.href = link; // Inserisci qui il link esterno
  }