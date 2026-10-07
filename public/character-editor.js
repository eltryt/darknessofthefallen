// Edits use the same owner-protected API as the profile. No local credentials.
export function attachCharacterEditor({rows,api,refresh,toast}) {
  const form=document.querySelector('#character');
  if(!form)return;
  const heading=form.previousElementSibling;
  const submit=form.querySelector('button[type=submit]');
  const main=form.elements.isMain;
  const cancel=document.createElement('button');
  cancel.type='button';cancel.className='secondary';cancel.textContent='Cancelar edición';cancel.hidden=true;
  form.append(cancel);
  let editing=null;
  function reset(){editing=null;form.reset();heading.textContent='Añadir personaje';submit.textContent='Guardar personaje';main.disabled=false;cancel.hidden=true;}
  cancel.onclick=reset;
  const table=document.querySelector('.table-wrap table');
  if(table){
    const th=document.createElement('th');th.scope='col';th.textContent='Acciones';table.querySelector('thead tr').append(th);
    for(const [index,tr] of [...table.querySelectorAll('tbody tr')].entries()){
      const character=rows[index],td=document.createElement('td'),button=document.createElement('button');
      button.type='button';button.className='secondary';button.textContent='Editar';button.setAttribute('aria-label',`Editar ${character.name}`);
      button.onclick=()=>{
        editing=character.id;
        for(const key of ['name','surname','class','role','spec','professions','availability','notes'])form.elements[key].value=character[key]||'';
        main.checked=!!character.is_main;main.disabled=true;cancel.hidden=false;
        heading.textContent=`Editar ${character.name}`;submit.textContent='Guardar cambios';form.elements.name.focus();
      };
      const archive=document.createElement('button');archive.type='button';archive.className='secondary danger';archive.textContent='Archivar';
      archive.onclick=async()=>{if(!confirm(`¿Archivar ${character.name}? Se retirará del roster, conservando su historial de asistencia y loot.`))return;archive.disabled=true;try{await api(`/api/characters/${character.id}`,'DELETE',{});toast('Personaje archivado');await refresh();}catch(error){toast(error.message);archive.disabled=false;}};
      td.append(button,archive);tr.append(td);
    }
  }
  // Capture phase prevents the creation handler from also running during editing.
  form.addEventListener('submit',async event=>{
    if(!editing)return;
    event.preventDefault();event.stopImmediatePropagation();submit.disabled=true;cancel.disabled=true;
    try{await api(`/api/characters/${editing}`,'PATCH',Object.fromEntries(new FormData(form)));toast('Personaje actualizado');await refresh();}
    catch(error){toast(error.message);}
    finally{submit.disabled=false;cancel.disabled=false;}
  },true);
}
