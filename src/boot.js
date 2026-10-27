try {
  await import('./app.js');
} catch (error) {
  console.error('Velvet startup failed', error);
  const main=document.querySelector('#content');
  const heading=document.createElement('h1');heading.textContent='Velvet could not start.';
  const body=document.createElement('p');body.className='notice';body.textContent='Extract the complete download into one folder and reopen Velvet.exe. Details: '+error.message;
  main.replaceChildren(heading,body);
}
